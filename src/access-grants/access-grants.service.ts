import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';

@Injectable()
export class AccessGrantsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List all active access grants for a given patient.
   */
  async findAll(patientId: string) {
    return this.prisma.accessGrant.findMany({
      where: { patientId, isActive: true },
      include: {
        doctor: {
          include: { user: true },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });
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

    return this.prisma.accessGrant.create({
      data: {
        patientId,
        doctorId: dto.doctorId,
        scope: dto.scope ?? 'full',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
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
      where: { doctorId, isActive: true },
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
      where: { patientId, isActive: true },
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
