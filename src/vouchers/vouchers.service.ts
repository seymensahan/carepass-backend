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

    // Generate unique codes with collision check
    const existingCodes = new Set<string>();
    const maxAttempts = count * 3;
    let attempts = 0;

    while (codes.length < count && attempts < maxAttempts) {
      attempts++;
      const code = buildCode(type);
      if (existingCodes.has(code)) continue;

      // Check DB for collision
      const exists = await this.prisma.voucher.findUnique({ where: { code } });
      if (exists) continue;

      existingCodes.add(code);
      codes.push(code);
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
      expiresAt: expiresAt ? new Date(expiresAt) : null,
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
  // VALIDATE VOUCHER
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
      throw new BadRequestException('Ce voucher a expire');
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

    // Find appropriate plan based on role and voucher type
    let planSlug: string;
    if (voucher.type === 'doctor') {
      planSlug = 'doctor_premium';
    } else if (voucher.type === 'nurse') {
      planSlug = 'nurse';
    } else {
      planSlug = 'patient';
    }

    let plan = await this.prisma.plan.findUnique({ where: { slug: planSlug } });

    // Fallback: try to find any active plan if the slug doesn't exist yet
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
