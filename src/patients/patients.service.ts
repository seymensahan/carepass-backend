import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientFilterDto } from './dto/patient-filter.dto';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // FIND ALL (paginated, role-based)
  // ---------------------------------------------------------------------------
  async findAll(filters: PatientFilterDto, user: any) {
    const { page = 1, limit = 20, search, city, region, gender } = filters;
    const skip = (page - 1) * limit;

    // Build base where clause
    const where: any = {};

    // Search by name or carypassId
    if (search) {
      where.OR = [
        { carypassId: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (region) where.region = { equals: region, mode: 'insensitive' };
    if (gender) where.gender = gender;

    // Role-based filtering
    if (user.role === 'doctor') {
      // Doctor can only see patients where an active AccessGrant exists
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }
      where.accessGrants = {
        some: {
          doctorId: doctor.id,
          isActive: true,
        },
      };
    } else if (user.role === 'institution_admin') {
      // Institution admin: return patients of doctors in their institution
      const institution = await this.prisma.institution.findUnique({
        where: { adminUserId: user.id },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvee');
      }
      where.accessGrants = {
        some: {
          isActive: true,
          doctor: {
            institutionId: institution.id,
          },
        },
      };
    }
    // super_admin: no additional filter

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // FIND ONE
  // ---------------------------------------------------------------------------
  async findOne(id: string, user: any) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            role: true,
          },
        },
        emergencyContacts: true,
        children: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient non trouve');
    }

    // Access check: own profile, doctor with grant, or super_admin
    await this.verifyAccess(patient, user);

    return patient;
  }

  // ---------------------------------------------------------------------------
  // FIND BY CARYPASS ID
  // ---------------------------------------------------------------------------
  async findByCarypassId(carypassId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { carypassId: carypassId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            role: true,
          },
        },
        emergencyContacts: true,
        children: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient non trouve avec ce CaryPass ID');
    }

    return patient;
  }

  /**
   * Find a patient by their public emergency token (the long hex string used
   * in the emergency QR code URL). Used by doctors/nurses who scanned a
   * patient's emergency QR and want to access the full record (subject to
   * the standard access-grant flow).
   */
  async findByEmergencyToken(token: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { emergencyToken: token },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            role: true,
          },
        },
        emergencyContacts: true,
        children: true,
      },
    });

    if (!patient) {
      throw new NotFoundException("Patient non trouve avec ce token d'urgence");
    }

    return patient;
  }

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreatePatientDto) {
    // Check if user already has a patient profile
    const existing = await this.prisma.patient.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Un profil patient existe deja pour cet utilisateur');
    }

    // Generate CaryPass ID using SystemSetting counter
    const carypassId = await this.generateCarypassId();

    // Generate emergency token
    const emergencyToken = uuidv4();

    const patient = await this.prisma.patient.create({
      data: {
        userId,
        carypassId,
        emergencyToken,
        dateOfBirth: new Date(dto.dateOfBirth),
        gender: dto.gender,
        bloodGroup: dto.bloodGroup,
        genotype: dto.genotype,
        address: dto.address,
        city: dto.city,
        region: dto.region,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return patient;
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------
  async update(id: string, userId: string, dto: UpdatePatientDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });

    if (!patient) {
      throw new NotFoundException('Patient non trouve');
    }

    // Only the patient themselves can update their profile
    if (patient.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que votre propre profil');
    }

    const data: any = {};
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.bloodGroup !== undefined) data.bloodGroup = dto.bloodGroup;
    if (dto.genotype !== undefined) data.genotype = dto.genotype;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.region !== undefined) data.region = dto.region;

    const updated = await this.prisma.patient.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // GET MEDICAL HISTORY
  // ---------------------------------------------------------------------------
  async getMedicalHistory(patientId: string, user: any) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundException('Patient non trouve');
    }

    // Verify access
    await this.verifyAccess(patient, user);

    const [consultations, prescriptions, labResults, vaccinations, allergies, conditions] =
      await Promise.all([
        this.prisma.consultation.findMany({
          where: { patientId },
          orderBy: { date: 'desc' },
          include: {
            doctor: {
              include: {
                user: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        }),
        this.prisma.prescription.findMany({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
          include: {
            items: true,
            doctor: {
              include: {
                user: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        }),
        this.prisma.labResult.findMany({
          where: { patientId },
          orderBy: { date: 'desc' },
          include: { items: true },
        }),
        this.prisma.vaccination.findMany({
          where: { patientId },
          orderBy: { date: 'desc' },
        }),
        this.prisma.allergy.findMany({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.medicalCondition.findMany({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      consultations,
      prescriptions,
      labResults,
      vaccinations,
      allergies,
      conditions,
    };
  }

  // ---------------------------------------------------------------------------
  // GET CONSULTATIONS (paginated)
  // ---------------------------------------------------------------------------
  async getConsultations(patientId: string, query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    await this.ensurePatientExists(patientId);

    const [data, total] = await Promise.all([
      this.prisma.consultation.findMany({
        where: { patientId },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          doctor: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.consultation.count({ where: { patientId } }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET LAB RESULTS (paginated)
  // ---------------------------------------------------------------------------
  async getLabResults(patientId: string, query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    await this.ensurePatientExists(patientId);

    const [data, total] = await Promise.all([
      this.prisma.labResult.findMany({
        where: { patientId },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          items: true,
          institution: {
            select: { name: true, city: true },
          },
        },
      }),
      this.prisma.labResult.count({ where: { patientId } }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET VACCINATIONS (paginated)
  // ---------------------------------------------------------------------------
  async getVaccinations(patientId: string, query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    await this.ensurePatientExists(patientId);

    const [data, total] = await Promise.all([
      this.prisma.vaccination.findMany({
        where: { patientId },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.vaccination.count({ where: { patientId } }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET ALLERGIES (no pagination)
  // ---------------------------------------------------------------------------
  async getAllergies(patientId: string) {
    await this.ensurePatientExists(patientId);

    const allergies = await this.prisma.allergy.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });

    return allergies;
  }

  // ---------------------------------------------------------------------------
  // GET CONDITIONS (no pagination)
  // ---------------------------------------------------------------------------
  async getConditions(patientId: string) {
    await this.ensurePatientExists(patientId);

    const conditions = await this.prisma.medicalCondition.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });

    return conditions;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Verify that the requesting user has access to the patient record.
   * Access is granted if:
   * - The user is the patient themselves
   * - The user is a doctor with an active AccessGrant
   * - The user is a super_admin
   */
  private async verifyAccess(patient: { userId: string }, user: any): Promise<void> {
    // Own profile
    if (patient.userId === user.id) return;

    // Super admin
    if (user.role === 'super_admin') return;

    // Legal guardian — patient is a dependent managed (or previously managed with read access) by current user
    if (user.role === 'patient') {
      const guardianPatient = await this.prisma.patient.findUnique({ where: { userId: user.id } });
      if (guardianPatient && (patient as any).id) {
        const guardianship = await this.prisma.legalGuardian.findUnique({
          where: {
            dependentId_guardianPatientId: {
              dependentId: (patient as any).id,
              guardianPatientId: guardianPatient.id,
            },
          },
        });
        if (guardianship && (guardianship.canManage || guardianship.readOnlyAfterTransfer)) {
          return;
        }
      }
    }

    // Doctor with active access grant
    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (doctor) {
        const grant = await this.prisma.accessGrant.findFirst({
          where: {
            patientId: (patient as any).id,
            doctorId: doctor.id,
            isActive: true,
          },
        });
        if (grant) return;
      }
    }

    // Institution admin - check if patient has grants from doctors in their institution
    if (user.role === 'institution_admin') {
      const institution = await this.prisma.institution.findUnique({
        where: { adminUserId: user.id },
      });
      if (institution) {
        const grant = await this.prisma.accessGrant.findFirst({
          where: {
            patientId: (patient as any).id,
            isActive: true,
            doctor: {
              institutionId: institution.id,
            },
          },
        });
        if (grant) return;
      }
    }

    throw new ForbiddenException('Acces refuse a ce dossier patient');
  }

  /**
   * Ensure a patient exists; throw NotFoundException otherwise.
   */
  private async ensurePatientExists(patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient non trouve');
    }
  }

  /**
   * Generate a unique CaryPass ID in the format CP-YYYY-XXXXX.
   * Uses a transactional counter stored in SystemSetting.
   */
  private async generateCarypassId(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await this.prisma.$transaction(async (tx) => {
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
      return counter;
    });
    return `CP-${year}-${result.toString().padStart(5, '0')}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEPENDENTS / LEGAL GUARDIANSHIP
  // ═══════════════════════════════════════════════════════════════════

  /**
   * List dependents managed by the current user (guardian).
   * Returns both actively-managed and past-managed (read-only after transfer).
   */
  async getMyDependents(userId: string) {
    const guardianPatient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!guardianPatient) {
      throw new NotFoundException('Profil patient non trouvé');
    }

    const guardianships = await this.prisma.legalGuardian.findMany({
      where: { guardianPatientId: guardianPatient.id },
      include: {
        dependent: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: guardianships.map((g) => ({
        guardianshipId: g.id,
        relationship: g.relationship,
        canManage: g.canManage,
        transferredAt: g.transferredAt,
        readOnlyAfterTransfer: g.readOnlyAfterTransfer,
        dependent: {
          id: g.dependent.id,
          carypassId: g.dependent.carypassId,
          firstName: g.dependent.user.firstName,
          lastName: g.dependent.user.lastName,
          dateOfBirth: g.dependent.dateOfBirth,
          gender: g.dependent.gender,
          bloodGroup: g.dependent.bloodGroup,
          genotype: g.dependent.genotype,
          isMinor: g.dependent.isMinor,
          avatarUrl: g.dependent.user.avatarUrl,
        },
      })),
    };
  }

  /**
   * Create a new dependent (minor) under current user's guardianship.
   * Creates a synthetic User + Patient + LegalGuardian link.
   */
  async createDependent(
    guardianUserId: string,
    data: {
      firstName: string;
      lastName: string;
      dateOfBirth: string;
      gender?: 'male' | 'female' | 'other';
      bloodGroup?: string;
      genotype?: string;
      relationship?: string;
      email?: string; // optional, auto-generated if missing
    },
  ) {
    if (!data.firstName || !data.lastName || !data.dateOfBirth) {
      throw new BadRequestException('firstName, lastName et dateOfBirth sont requis');
    }

    const guardianPatient = await this.prisma.patient.findUnique({
      where: { userId: guardianUserId },
      include: { user: { select: { email: true } } },
    });
    if (!guardianPatient) {
      throw new NotFoundException('Profil patient tuteur non trouvé');
    }

    // Generate synthetic email if not provided
    const parentEmail = guardianPatient.user.email;
    const slug = `${data.firstName}.${data.lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
    const syntheticEmail = data.email || parentEmail.replace('@', `+${slug}.${Date.now()}@`);

    // Check email uniqueness
    const existing = await this.prisma.user.findUnique({ where: { email: syntheticEmail } });
    if (existing) {
      throw new ConflictException('Un compte avec cet email existe déjà');
    }

    const carypassId = await this.generateCarypassId();
    // Random placeholder password until transfer
    const placeholderHash = await bcrypt.hash(uuidv4(), 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: syntheticEmail,
          passwordHash: placeholderHash,
          role: 'patient',
          availableRoles: ['patient'],
          firstName: data.firstName,
          lastName: data.lastName,
          isActive: false, // Inactive until transfer
        },
      });

      const patient = await tx.patient.create({
        data: {
          userId: user.id,
          carypassId,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender as any,
          bloodGroup: data.bloodGroup,
          genotype: data.genotype,
          isMinor: true,
          managedByGuardian: true,
        },
      });

      const guardianship = await tx.legalGuardian.create({
        data: {
          dependentId: patient.id,
          guardianPatientId: guardianPatient.id,
          relationship: data.relationship || 'parent',
          isPrimary: true,
          canManage: true,
        },
      });

      return { user, patient, guardianship };
    });

    return {
      success: true,
      data: {
        guardianshipId: result.guardianship.id,
        dependent: {
          id: result.patient.id,
          carypassId: result.patient.carypassId,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          dateOfBirth: result.patient.dateOfBirth,
          gender: result.patient.gender,
          bloodGroup: result.patient.bloodGroup,
          genotype: result.patient.genotype,
          isMinor: result.patient.isMinor,
        },
      },
    };
  }

  /**
   * Update a dependent's info. Only the active guardian can update.
   */
  async updateDependent(guardianUserId: string, dependentId: string, data: any) {
    const guardianPatient = await this.prisma.patient.findUnique({ where: { userId: guardianUserId } });
    if (!guardianPatient) throw new NotFoundException('Tuteur non trouvé');

    const guardianship = await this.prisma.legalGuardian.findUnique({
      where: {
        dependentId_guardianPatientId: { dependentId, guardianPatientId: guardianPatient.id },
      },
      include: { dependent: { include: { user: true } } },
    });
    if (!guardianship) throw new NotFoundException('Vous n\'êtes pas tuteur de ce dépendant');
    if (!guardianship.canManage) {
      throw new ForbiddenException('La gestion de ce dépendant a été transférée');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const userUpdates: any = {};
      if (data.firstName) userUpdates.firstName = data.firstName;
      if (data.lastName) userUpdates.lastName = data.lastName;
      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({ where: { id: guardianship.dependent.userId }, data: userUpdates });
      }

      const patientUpdates: any = {};
      if (data.dateOfBirth) patientUpdates.dateOfBirth = new Date(data.dateOfBirth);
      if (data.gender !== undefined) patientUpdates.gender = data.gender;
      if (data.bloodGroup !== undefined) patientUpdates.bloodGroup = data.bloodGroup;
      if (data.genotype !== undefined) patientUpdates.genotype = data.genotype;
      return tx.patient.update({ where: { id: dependentId }, data: patientUpdates });
    });

    return { success: true, data: updated };
  }

  /**
   * Transfer management of a dependent to themselves.
   * Called when the dependent reaches the configured age.
   */
  async transferDependent(
    guardianUserId: string,
    dependentId: string,
    data: { newEmail: string; newPassword: string; keepReadAccess?: boolean },
  ) {
    if (!data.newEmail || !data.newPassword) {
      throw new BadRequestException('Nouvel email et mot de passe requis');
    }
    if (data.newPassword.length < 6) {
      throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères');
    }

    const guardianPatient = await this.prisma.patient.findUnique({ where: { userId: guardianUserId } });
    if (!guardianPatient) throw new NotFoundException('Tuteur non trouvé');

    const guardianship = await this.prisma.legalGuardian.findUnique({
      where: {
        dependentId_guardianPatientId: { dependentId, guardianPatientId: guardianPatient.id },
      },
      include: { dependent: { include: { user: true } } },
    });
    if (!guardianship) throw new NotFoundException('Vous n\'êtes pas tuteur de ce dépendant');
    if (!guardianship.canManage) {
      throw new BadRequestException('La gestion de ce dépendant a déjà été transférée');
    }

    // Check minimum age from system settings
    const ageSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'dependent_transfer_min_age' },
    });
    const minAge = parseInt(ageSetting?.value || '16');

    const dob = new Date(guardianship.dependent.dateOfBirth);
    const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < minAge) {
      throw new BadRequestException(
        `Le dépendant doit avoir au moins ${minAge} ans pour le transfert (âge actuel: ${Math.floor(ageYears)} ans)`,
      );
    }

    // Check new email is not taken by another active user
    const existingEmail = await this.prisma.user.findUnique({ where: { email: data.newEmail } });
    if (existingEmail && existingEmail.id !== guardianship.dependent.userId) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);

    await this.prisma.$transaction(async (tx) => {
      // Update user: activate, new email, new password
      await tx.user.update({
        where: { id: guardianship.dependent.userId },
        data: {
          email: data.newEmail,
          passwordHash,
          isActive: true,
        },
      });

      // Update patient: no longer managed by guardian
      await tx.patient.update({
        where: { id: dependentId },
        data: {
          isMinor: false,
          managedByGuardian: false,
        },
      });

      // Update guardianship: mark as transferred
      await tx.legalGuardian.update({
        where: { id: guardianship.id },
        data: {
          canManage: false,
          transferredAt: new Date(),
          readOnlyAfterTransfer: data.keepReadAccess ?? true,
        },
      });
    });

    return {
      success: true,
      message: 'Gestion transférée avec succès. Le dépendant peut maintenant se connecter avec son propre compte.',
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // GUARDIANSHIP HELPERS (used by access control)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Returns the list of patient IDs a user can access as a guardian.
   * Includes both actively managed and read-only-after-transfer dependents.
   */
  async getManagedPatientIds(userId: string, includeReadOnly = true): Promise<string[]> {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) return [];

    const guardianships = await this.prisma.legalGuardian.findMany({
      where: {
        guardianPatientId: patient.id,
        ...(includeReadOnly ? {} : { canManage: true }),
      },
      select: { dependentId: true, canManage: true, readOnlyAfterTransfer: true },
    });

    return guardianships
      .filter((g) => g.canManage || g.readOnlyAfterTransfer)
      .map((g) => g.dependentId);
  }
}
