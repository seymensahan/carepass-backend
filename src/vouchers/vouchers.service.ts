import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_PREFIX_MAP: Record<string, string> = {
  patient: 'PAT',
  doctor: 'DOC',
  nurse: 'NUR',
};

const ROLE_TYPE_MAP: Record<string, string> = {
  patient: 'patient',
  doctor: 'doctor',
  nurse: 'nurse',
};

/**
 * Generate a random 6-char uppercase alphanumeric string.
 */
function randomAlphanumeric(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Build a voucher code like CP-PAT-X7K2M9
 */
function buildCode(type: string): string {
  const prefix = TYPE_PREFIX_MAP[type] ?? 'GEN';
  return `CP-${prefix}-${randomAlphanumeric(6)}`;
}

/**
 * Parse a voucher expiration date.
 * If the input is a date-only string (YYYY-MM-DD), interpret it as END of day local time
 * to avoid the voucher being marked expired the same day it is created.
 * Otherwise, parse as a full ISO datetime.
 */
function parseExpiresAt(input?: string): Date | null {
  if (!input) return null;
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (dateOnlyMatch) {
    // End of day in local server time, then converted to UTC by the Date constructor
    const [year, month, day] = input.split('-').map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  return new Date(input);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // -------------------------------------------------------------------------
  // GENERATE BATCH
  // -------------------------------------------------------------------------
  async generateBatch(
    createdById: string,
    type: 'patient' | 'doctor' | 'nurse',
    count: number,
    durationMonths = 6,
    discountPercent = 100,
    expiresAt?: string,
  ) {
    const batchId = uuidv4();
    const codes: string[] = [];

    // OPTIMIZED: Generate a candidate pool in-memory and check the DB for collisions
    // in a SINGLE query (findMany with `in`) instead of N sequential findUnique calls.
    const existingCodes = new Set<string>();
    const maxRounds = 3;
    for (let round = 0; round < maxRounds && codes.length < count; round++) {
      const needed = count - codes.length;
      const candidates: string[] = [];
      // Over-provision 2x to reduce collision risk
      for (let i = 0; i < needed * 2; i++) {
        const c = buildCode(type);
        if (!existingCodes.has(c)) candidates.push(c);
      }
      if (candidates.length === 0) continue;

      // Single query collision check
      const collisions = await this.prisma.voucher.findMany({
        where: { code: { in: candidates } },
        select: { code: true },
      });
      const collisionSet = new Set(collisions.map((v) => v.code));

      for (const c of candidates) {
        if (codes.length >= count) break;
        if (collisionSet.has(c) || existingCodes.has(c)) continue;
        existingCodes.add(c);
        codes.push(c);
      }
    }

    if (codes.length < count) {
      throw new ConflictException(
        `Impossible de generer ${count} codes uniques. ${codes.length} generes sur ${count} demandes.`,
      );
    }

    // Bulk insert
    const data = codes.map((code) => ({
      id: uuidv4(),
      code,
      type,
      discountPercent,
      durationMonths,
      isUsed: false,
      createdById,
      batchId,
      expiresAt: parseExpiresAt(expiresAt),
    }));

    await this.prisma.voucher.createMany({ data });

    this.logger.log(
      `Batch ${batchId}: ${codes.length} vouchers "${type}" crees par ${createdById}`,
    );

    return {
      batchId,
      type,
      count: codes.length,
      durationMonths,
      discountPercent,
      codes,
    };
  }

  // -------------------------------------------------------------------------
  // LIST VOUCHERS (paginated + filters)
  // -------------------------------------------------------------------------
  async getVouchers(filters: {
    type?: string;
    isUsed?: string;
    batchId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.type) where.type = filters.type;
    if (filters.batchId) where.batchId = filters.batchId;
    if (filters.isUsed !== undefined && filters.isUsed !== '') {
      where.isUsed = filters.isUsed === 'true';
    }

    const [vouchers, total] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          usedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        },
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return {
      data: vouchers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------
  async getStats() {
    const [
      totalPatient,
      usedPatient,
      totalDoctor,
      usedDoctor,
      totalNurse,
      usedNurse,
      promoterCount,
    ] = await Promise.all([
      this.prisma.voucher.count({ where: { type: 'patient' } }),
      this.prisma.voucher.count({ where: { type: 'patient', isUsed: true } }),
      this.prisma.voucher.count({ where: { type: 'doctor' } }),
      this.prisma.voucher.count({ where: { type: 'doctor', isUsed: true } }),
      this.prisma.voucher.count({ where: { type: 'nurse' } }),
      this.prisma.voucher.count({ where: { type: 'nurse', isUsed: true } }),
      this.prisma.user.count({ where: { isPromoter: true } }),
    ]);

    return {
      patient: { total: totalPatient, used: usedPatient, available: totalPatient - usedPatient },
      doctor: { total: totalDoctor, used: usedDoctor, available: totalDoctor - usedDoctor },
      nurse: { total: totalNurse, used: usedNurse, available: totalNurse - usedNurse },
      overall: {
        total: totalPatient + totalDoctor + totalNurse,
        used: usedPatient + usedDoctor + usedNurse,
        available:
          totalPatient - usedPatient + (totalDoctor - usedDoctor) + (totalNurse - usedNurse),
      },
      promoterCount,
    };
  }

  // -------------------------------------------------------------------------
  // VALIDATE VOUCHER (public — no user context, just checks code validity)
  // -------------------------------------------------------------------------
  async validateVoucherPublic(code: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { code: code.trim().toUpperCase() } });

    if (!voucher) {
      throw new NotFoundException('Code voucher invalide');
    }

    if (voucher.isUsed) {
      throw new BadRequestException('Ce voucher a deja ete utilise');
    }

    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      const expiredDate = new Date(voucher.expiresAt).toLocaleDateString('fr-FR');
      throw new BadRequestException(`Ce voucher a expire le ${expiredDate}`);
    }

    return {
      valid: true,
      code: voucher.code,
      type: voucher.type,
      discountPercent: voucher.discountPercent,
      durationMonths: voucher.durationMonths,
    };
  }

  // -------------------------------------------------------------------------
  // VALIDATE VOUCHER (authenticated — checks code + user role match)
  // -------------------------------------------------------------------------
  async validateVoucher(code: string, userId: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { code: code.trim().toUpperCase() } });

    if (!voucher) {
      throw new NotFoundException('Code voucher invalide');
    }

    if (voucher.isUsed) {
      throw new BadRequestException('Ce voucher a deja ete utilise');
    }

    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      const expiredDate = new Date(voucher.expiresAt).toLocaleDateString('fr-FR');
      throw new BadRequestException(`Ce voucher a expire le ${expiredDate}`);
    }

    // Check that the voucher type matches the user's role
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouve');
    }

    const expectedRole = ROLE_TYPE_MAP[voucher.type];
    if (user.role !== expectedRole) {
      throw new BadRequestException(
        `Ce voucher est reserve aux ${voucher.type}s. Votre role: ${user.role}`,
      );
    }

    return {
      valid: true,
      code: voucher.code,
      type: voucher.type,
      discountPercent: voucher.discountPercent,
      durationMonths: voucher.durationMonths,
      expiresAt: voucher.expiresAt,
    };
  }

  // -------------------------------------------------------------------------
  // REDEEM VOUCHER
  // -------------------------------------------------------------------------
  async redeemVoucher(code: string, userId: string) {
    const normalizedCode = code.trim().toUpperCase();

    // Validate first
    await this.validateVoucher(normalizedCode, userId);

    const voucher = await this.prisma.voucher.findUnique({ where: { code: normalizedCode } });
    if (!voucher) {
      throw new NotFoundException('Code voucher invalide');
    }

    // Check user does not already have an active subscription
    const existingActive = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
    });
    if (existingActive) {
      throw new BadRequestException('Vous avez deja un abonnement actif');
    }

    // Determine the plan to assign
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouve');

    // Find appropriate plan based on voucher type.
    // Try multiple slug variants for compatibility with existing seed data.
    let planSlugs: string[];
    if (voucher.type === 'doctor') {
      planSlugs = ['medecin-premium', 'doctor_premium', 'doctor-premium'];
    } else if (voucher.type === 'nurse') {
      // Nurses don't have a dedicated plan — use the patient plan (they still get free access)
      planSlugs = ['patient', 'nurse'];
    } else {
      planSlugs = ['patient'];
    }

    let plan = null;
    for (const slug of planSlugs) {
      plan = await this.prisma.plan.findUnique({ where: { slug } });
      if (plan) break;
    }

    // Fallback: try to find any active plan if none of the slugs match
    if (!plan) {
      plan = await this.prisma.plan.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!plan) {
      throw new BadRequestException(
        'Aucun plan disponible. Contactez l\'administrateur.',
      );
    }

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + voucher.durationMonths);

    // Execute everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark voucher as used
      const updatedVoucher = await tx.voucher.update({
        where: { code: normalizedCode },
        data: {
          isUsed: true,
          usedById: userId,
          usedAt: new Date(),
        },
      });

      // 2. Mark user as promoter
      await tx.user.update({
        where: { id: userId },
        data: { isPromoter: true },
      });

      // 3. Create subscription
      const subscription = await tx.subscription.create({
        data: {
          userId,
          planId: plan!.id,
          status: 'active',
          startDate,
          endDate,
          autoRenew: false, // Promoter subscriptions don't auto-renew
        },
      });

      return { voucher: updatedVoucher, subscription };
    });

    this.logger.log(
      `Voucher ${normalizedCode} utilise par ${userId}. Abonnement cree jusqu'au ${endDate.toISOString()}`,
    );

    return {
      message: 'Voucher utilise avec succes ! Votre abonnement gratuit est actif.',
      voucher: {
        code: result.voucher.code,
        type: result.voucher.type,
        discountPercent: result.voucher.discountPercent,
        durationMonths: result.voucher.durationMonths,
      },
      subscription: {
        id: result.subscription.id,
        status: result.subscription.status,
        startDate: result.subscription.startDate,
        endDate: result.subscription.endDate,
        planId: result.subscription.planId,
      },
      isPromoter: true,
    };
  }

  // -------------------------------------------------------------------------
  // DELETE VOUCHER (unused only)
  // -------------------------------------------------------------------------
  async deleteVoucher(id: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) {
      throw new NotFoundException('Voucher non trouve');
    }
    if (voucher.isUsed) {
      throw new BadRequestException('Impossible de supprimer un voucher deja utilise');
    }

    await this.prisma.voucher.delete({ where: { id } });
    return { message: 'Voucher supprime' };
  }

  // -------------------------------------------------------------------------
  // FIX EXPIRED-SAME-DAY VOUCHERS (one-shot maintenance)
  // -------------------------------------------------------------------------
  /**
   * Some vouchers were generated with `expiresAt` set to a date-only string,
   * which JS parses as midnight UTC and makes them expired the same day.
   * This method removes the expiresAt on any unused voucher whose expiresAt
   * is today (UTC) at exactly midnight, restoring them to "no expiration".
   */
  async fixExpiredSameDayVouchers() {
    const now = new Date();
    const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayMidnightUtc = new Date(startOfTodayUtc);
    yesterdayMidnightUtc.setUTCDate(yesterdayMidnightUtc.getUTCDate() - 1);

    // Find unused vouchers whose expiresAt is exactly midnight UTC of any day
    // and is in the past
    const candidates = await this.prisma.voucher.findMany({
      where: {
        isUsed: false,
        expiresAt: { lt: now },
      },
    });

    let fixed = 0;
    for (const v of candidates) {
      if (!v.expiresAt) continue;
      const d = new Date(v.expiresAt);
      // Detect midnight-UTC dates (the bug signature)
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
        // Push expiresAt to end of that day local
        const fixedDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
        // If still in the past after fix, just clear it
        const newExpiresAt = fixedDate < now ? null : fixedDate;
        await this.prisma.voucher.update({
          where: { id: v.id },
          data: { expiresAt: newExpiresAt },
        });
        fixed++;
      }
    }

    this.logger.log(`Fix vouchers: ${fixed} voucher(s) corriges`);
    return { fixed };
  }

  // -------------------------------------------------------------------------
  // EXPORT CSV
  // -------------------------------------------------------------------------
  async exportVouchers(filters?: { type?: string; batchId?: string; isUsed?: string }) {
    const where: any = {};
    if (filters?.type) where.type = filters.type;
    if (filters?.batchId) where.batchId = filters.batchId;
    if (filters?.isUsed !== undefined && filters?.isUsed !== '') {
      where.isUsed = filters.isUsed === 'true';
    }

    const vouchers = await this.prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        usedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    // Build CSV
    const headers = [
      'Code',
      'Type',
      'Reduction (%)',
      'Duree (mois)',
      'Utilise',
      'Utilise par',
      'Email utilisateur',
      'Date utilisation',
      'Batch ID',
      'Expire le',
      'Cree le',
    ];

    const rows = vouchers.map((v) => [
      v.code,
      v.type,
      v.discountPercent.toString(),
      v.durationMonths.toString(),
      v.isUsed ? 'Oui' : 'Non',
      v.usedBy ? `${v.usedBy.firstName} ${v.usedBy.lastName}` : '',
      v.usedBy?.email ?? '',
      v.usedAt ? v.usedAt.toISOString() : '',
      v.batchId ?? '',
      v.expiresAt ? v.expiresAt.toISOString() : '',
      v.createdAt.toISOString(),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join(
      '\n',
    );

    return csv;
  }
}
