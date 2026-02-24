import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
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

    // Search by name or carepassId
    if (search) {
      where.OR = [
        { carepassId: { contains: search, mode: 'insensitive' } },
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
  // FIND BY CAREPASS ID
  // ---------------------------------------------------------------------------
  async findByCarepassId(carepassId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { carepassId },
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
    });

    if (!patient) {
      throw new NotFoundException('Patient non trouve avec ce CarePass ID');
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

    // Generate CarePass ID using SystemSetting counter
    const carepassId = await this.generateCarepassId();

    // Generate emergency token
    const emergencyToken = uuidv4();

    const patient = await this.prisma.patient.create({
      data: {
        userId,
        carepassId,
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
   * Generate a unique CarePass ID in the format CP-YYYY-XXXXX.
   * Uses a transactional counter stored in SystemSetting.
   */
  private async generateCarepassId(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await this.prisma.$transaction(async (tx) => {
      const setting = await tx.systemSetting.findUnique({
        where: { key: 'carepass_id_counter' },
      });
      const counter = parseInt(setting?.value || '0') + 1;
      await tx.systemSetting.upsert({
        where: { key: 'carepass_id_counter' },
        update: { value: counter.toString() },
        create: {
          key: 'carepass_id_counter',
          value: counter.toString(),
          description: 'Compteur CarePass ID',
        },
      });
      return counter;
    });
    return `CP-${year}-${result.toString().padStart(5, '0')}`;
  }
}
