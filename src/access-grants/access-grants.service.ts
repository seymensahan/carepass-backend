import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateAccessGrantDto, durationToExpiresAt } from './dto/create-access-grant.dto';

@Injectable()
export class AccessGrantsService {
  private readonly logger = new Logger(AccessGrantsService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Build a Prisma "active and not expired" filter.
   */
  private notExpiredFilter() {
    return {
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: new Date() } },
      ],
    };
  }

  /**
   * List all active (non-expired) access grants for a given patient.
   */
  async findAll(patientId: string) {
    return this.prisma.accessGrant.findMany({
      where: { patientId, ...this.notExpiredFilter() },
      include: {
        doctor: {
          include: { user: true },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /**
   * Auto-revoke all access grants whose expiresAt has passed.
   * Called on app startup and every 24 hours.
   */
  async revokeExpiredGrants() {
    const now = new Date();
    const result = await this.prisma.accessGrant.updateMany({
      where: {
        isActive: true,
        expiresAt: { lt: now, not: null },
      },
      data: {
        isActive: false,
        revokedAt: now,
      },
    });
    if (result.count > 0) {
      this.logger.log(`${result.count} access grant(s) expirés révoqués automatiquement`);
    }
    return { revoked: result.count };
  }

  /**
   * Create a new access grant for a patient → doctor relationship.
   * Throws ConflictException if an active grant already exists.
   */
  async create(patientId: string, dto: CreateAccessGrantDto) {
    const existing = await this.prisma.accessGrant.findFirst({
      where: {
        patientId,
        doctorId: dto.doctorId,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Un accès actif existe déjà pour ce médecin',
      );
    }

    // Resolve expiresAt: explicit expiresAt wins over duration.
    // If neither is provided, fall back to a sensible default (1 week) instead of permanent.
    let resolvedExpiresAt: Date | null;
    if (dto.expiresAt) {
      resolvedExpiresAt = new Date(dto.expiresAt);
    } else if (dto.duration !== undefined) {
      resolvedExpiresAt = durationToExpiresAt(dto.duration);
    } else {
      // No duration provided — default to 1 week to avoid accidental permanent grants
      resolvedExpiresAt = durationToExpiresAt('1_semaine');
    }

    return this.prisma.accessGrant.create({
      data: {
        patientId,
        doctorId: dto.doctorId,
        scope: dto.scope ?? 'full',
        expiresAt: resolvedExpiresAt,
      },
    });
  }

  /**
   * Revoke an access grant (soft-revoke: set isActive=false, revokedAt=now).
   * Verifies that the grant belongs to the given patient.
   */
  async revoke(id: string, patientId: string) {
    const grant = await this.prisma.accessGrant.findUnique({
      where: { id },
    });

    if (!grant) {
      throw new NotFoundException('Accès non trouvé');
    }

    if (grant.patientId !== patientId) {
      throw new NotFoundException('Accès non trouvé');
    }

    return this.prisma.accessGrant.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * List all active access grants for a given doctor (their patients).
   */
  async findPatients(doctorId: string) {
    const grants = await this.prisma.accessGrant.findMany({
      where: { doctorId, ...this.notExpiredFilter() },
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return grants.map((grant) => ({
      grantId: grant.id,
      scope: grant.scope,
      grantedAt: grant.grantedAt,
      expiresAt: grant.expiresAt,
      patient: grant.patient,
    }));
  }

  /**
   * List doctors who currently have active access to this patient.
   * Returns doctor profiles with user info.
   */
  async findDoctors(patientId: string) {
    const grants = await this.prisma.accessGrant.findMany({
      where: { patientId, ...this.notExpiredFilter() },
      include: {
        doctor: {
          include: { user: true },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return grants.map((grant) => ({
      grantId: grant.id,
      scope: grant.scope,
      grantedAt: grant.grantedAt,
      expiresAt: grant.expiresAt,
      doctor: grant.doctor,
    }));
  }
}
