import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';

@Injectable()
export class ChildrenService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List all children for the given patient.
   * Includes a count of vaccinations for each child.
   */
  async findAll(patientId: string) {
    const children = await this.prisma.child.findMany({
      where: { parentId: patientId },
      include: {
        _count: {
          select: { vaccinations: true },
        },
      },
      orderBy: { dateOfBirth: 'desc' },
    });

    return children;
  }

  /**
   * Get a single child by ID.
   * Verifies that the child belongs to the given patient.
   * Includes vaccinations.
   */
  async findOne(id: string, patientId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id },
      include: {
        vaccinations: true,
      },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    return child;
  }

  /**
   * Create a new child linked to the given patient.
   */
  async create(patientId: string, dto: CreateChildDto) {
    const child = await this.prisma.child.create({
      data: {
        parentId: patientId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: new Date(dto.dateOfBirth),
        gender: dto.gender,
        bloodGroup: dto.bloodGroup,
        genotype: dto.genotype,
        weightKg: dto.weightKg,
        heightCm: dto.heightCm,
        dependentType: dto.dependentType || 'child',
      },
    });

    return child;
  }

  /**
   * Update a child. Verifies ownership.
   */
  async update(id: string, patientId: string, dto: UpdateChildDto) {
    const child = await this.prisma.child.findUnique({
      where: { id },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    const updated = await this.prisma.child.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.dateOfBirth !== undefined && { dateOfBirth: new Date(dto.dateOfBirth) }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.bloodGroup !== undefined && { bloodGroup: dto.bloodGroup }),
        ...(dto.genotype !== undefined && { genotype: dto.genotype }),
        ...(dto.weightKg !== undefined && { weightKg: dto.weightKg }),
        ...(dto.heightCm !== undefined && { heightCm: dto.heightCm }),
        ...(dto.dependentType !== undefined && { dependentType: dto.dependentType }),
      },
    });

    return updated;
  }

  /**
   * Delete a child. Verifies ownership.
   */
  async remove(id: string, patientId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    await this.prisma.child.delete({
      where: { id },
    });

    return { message: 'Enfant supprimé avec succès' };
  }

  /**
   * Get vaccinations for a child. Verifies parent ownership.
   */
  async getVaccinations(childId: string, patientId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    const vaccinations = await this.prisma.vaccination.findMany({
      where: { childId },
      orderBy: { date: 'desc' },
    });

    return vaccinations;
  }

  /**
   * Promote a Child record to a full Patient with its own CaryPass.
   *
   * Use case: parent wants to share their dependent's medical record with a
   * doctor for a real consultation (not just emergency). The doctor needs a
   * CaryPass to scan/lookup, which a basic Child record doesn't have.
   *
   * What this does:
   *   1. Verifies the child belongs to the parent
   *   2. If already promoted (Patient.guardianship.dependentId exists with this child) → returns existing
   *   3. Else creates:
   *      - User with synthetic email (no real account login — managed by parent)
   *      - Patient with new CaryPass + emergencyToken
   *      - LegalGuardian linking parent ↔ new dependent patient (canManage=true)
   *      - Migrates the child's vaccinations to the new patient
   *   4. Returns the new patient + carypassId for sharing
   *
   * The Child record is kept intact so the parent's UI doesn't break.
   * A `promotedPatientId` link could be added later if needed.
   */
  async promoteToPatient(childId: string, parentPatientId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });
    if (!child) throw new NotFoundException('Enfant non trouvé');
    if (child.parentId !== parentPatientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    // Idempotency check: do we already have a Patient promoted from this child?
    // We detect by looking for an existing LegalGuardian whose dependent's user
    // has the synthetic email pattern for this child.
    const syntheticEmail = `dep-${childId}@carypass.local`;
    const existingUser = await this.prisma.user.findUnique({
      where: { email: syntheticEmail },
      include: { patient: true },
    });
    if (existingUser?.patient) {
      return {
        success: true,
        alreadyPromoted: true,
        carypassId: existingUser.patient.carypassId,
        emergencyToken: existingUser.patient.emergencyToken,
        patientId: existingUser.patient.id,
      };
    }

    // Generate CaryPass ID + emergency token in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // CaryPass ID
      const setting = await tx.systemSetting.findUnique({
        where: { key: 'carypass_id_counter' },
      });
      const counter = parseInt(setting?.value || '0') + 1;
      await tx.systemSetting.upsert({
        where: { key: 'carypass_id_counter' },
        update: { value: counter.toString() },
        create: {
          key: 'carypass_id_counter',
          value: counter.toString(),
          description: 'Compteur CaryPass ID',
        },
      });
      const carypassId = `CP-${new Date().getFullYear()}-${counter
        .toString()
        .padStart(5, '0')}`;

      // Random password — the dependent has no autonomous login (managed by guardian).
      // We still need a hash so the User row is valid; reset flow can be used if
      // the dependent ever needs an account.
      const passwordHash = await bcrypt.hash(randomBytes(16).toString('hex'), 12);

      // User
      const user = await tx.user.create({
        data: {
          email: syntheticEmail,
          passwordHash,
          role: Role.patient,
          availableRoles: [Role.patient],
          firstName: child.firstName,
          lastName: child.lastName,
          isActive: false, // synthetic — no login allowed
        },
      });

      // Patient
      const emergencyToken = randomBytes(16).toString('hex');
      const patient = await tx.patient.create({
        data: {
          userId: user.id,
          carypassId,
          dateOfBirth: child.dateOfBirth,
          gender: child.gender,
          bloodGroup: child.bloodGroup,
          genotype: child.genotype,
          emergencyToken,
        },
      });

      // LegalGuardian link
      await tx.legalGuardian.create({
        data: {
          dependentId: patient.id,
          guardianPatientId: parentPatientId,
          relationship: 'parent',
          isPrimary: true,
          canManage: true,
        },
      });

      // Migrate the child's vaccinations to the new patient
      await tx.vaccination.updateMany({
        where: { childId: child.id },
        data: { patientId: patient.id, childId: null },
      });

      return { patient, carypassId, emergencyToken };
    });

    return {
      success: true,
      alreadyPromoted: false,
      carypassId: result.carypassId,
      emergencyToken: result.emergencyToken,
      patientId: result.patient.id,
    };
  }
}
