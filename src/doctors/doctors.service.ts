import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorFilterDto } from './dto/doctor-filter.dto';

@Injectable()
export class DoctorsService {
  private readonly logger = new Logger(DoctorsService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // FIND ALL (paginated, with filters)
  // ---------------------------------------------------------------------------
  async findAll(filters: DoctorFilterDto) {
    const { page = 1, limit = 20, search, specialty, city, verified } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Search by doctor name
    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    if (specialty) {
      where.specialty = { equals: specialty, mode: 'insensitive' };
    }

    if (city) {
      where.city = { equals: city, mode: 'insensitive' };
    }

    if (verified !== undefined) {
      where.isVerified = verified === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.doctor.findMany({
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
          institution: {
            select: {
              id: true,
              name: true,
              type: true,
              city: true,
            },
          },
        },
      }),
      this.prisma.doctor.count({ where }),
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
  async findOne(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
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
        institution: {
          select: {
            id: true,
            name: true,
            type: true,
            address: true,
            city: true,
            region: true,
            phone: true,
          },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException('Medecin non trouve');
    }

    return doctor;
  }

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreateDoctorDto) {
    // Check if user already has a doctor profile
    const existing = await this.prisma.doctor.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Un profil medecin existe deja pour cet utilisateur');
    }

    // Check license number uniqueness
    const existingLicense = await this.prisma.doctor.findUnique({
      where: { licenseNumber: dto.licenseNumber },
    });
    if (existingLicense) {
      throw new ConflictException('Ce numero de licence est deja utilise');
    }

    // If institutionId provided, verify institution exists
    if (dto.institutionId) {
      const institution = await this.prisma.institution.findUnique({
        where: { id: dto.institutionId },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvee');
      }
    }

    const doctor = await this.prisma.doctor.create({
      data: {
        userId,
        specialty: dto.specialty,
        licenseNumber: dto.licenseNumber,
        institutionId: dto.institutionId,
        bio: dto.bio,
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
        institution: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return doctor;
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------
  async update(id: string, userId: string, dto: UpdateDoctorDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
    });

    if (!doctor) {
      throw new NotFoundException('Medecin non trouve');
    }

    // Only the doctor themselves can update their profile
    if (doctor.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que votre propre profil');
    }

    // Check license number uniqueness if being updated
    if (dto.licenseNumber && dto.licenseNumber !== doctor.licenseNumber) {
      const existingLicense = await this.prisma.doctor.findUnique({
        where: { licenseNumber: dto.licenseNumber },
      });
      if (existingLicense) {
        throw new ConflictException('Ce numero de licence est deja utilise');
      }
    }

    // If institutionId provided, verify institution exists
    if (dto.institutionId) {
      const institution = await this.prisma.institution.findUnique({
        where: { id: dto.institutionId },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvee');
      }
    }

    const data: any = {};
    if (dto.specialty !== undefined) data.specialty = dto.specialty;
    if (dto.licenseNumber !== undefined) data.licenseNumber = dto.licenseNumber;
    if (dto.institutionId !== undefined) data.institutionId = dto.institutionId;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.region !== undefined) data.region = dto.region;

    const updated = await this.prisma.doctor.update({
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
        institution: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // VERIFY
  // ---------------------------------------------------------------------------
  async verify(id: string, verifierId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
    });

    if (!doctor) {
      throw new NotFoundException('Medecin non trouve');
    }

    if (doctor.isVerified) {
      throw new ConflictException('Ce medecin est deja verifie');
    }

    const updated = await this.prisma.doctor.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Medecin ${id} verifie par l'utilisateur ${verifierId}`);

    return updated;
  }

  // ---------------------------------------------------------------------------
  // GET PATIENTS (via AccessGrants)
  // ---------------------------------------------------------------------------
  async getPatients(doctorId: string, query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    // Ensure doctor exists
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
    });
    if (!doctor) {
      throw new NotFoundException('Medecin non trouve');
    }

    const where = {
      doctorId,
      isActive: true,
    };

    const [grants, total] = await Promise.all([
      this.prisma.accessGrant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { grantedAt: 'desc' },
        include: {
          patient: {
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
          },
        },
      }),
      this.prisma.accessGrant.count({ where }),
    ]);

    // Extract patients from grants
    const data = grants.map((grant) => ({
      ...grant.patient,
      grantId: grant.id,
      grantedAt: grant.grantedAt,
      scope: grant.scope,
    }));

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
  // GET STATS
  // ---------------------------------------------------------------------------
  async getStats(doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
    });
    if (!doctor) {
      throw new NotFoundException('Medecin non trouve');
    }

    // Get the start of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPatients, totalConsultations, consultationsThisMonth, pendingRequests] =
      await Promise.all([
        // Total active patients (via AccessGrants)
        this.prisma.accessGrant.count({
          where: {
            doctorId,
            isActive: true,
          },
        }),
        // Total consultations
        this.prisma.consultation.count({
          where: { doctorId },
        }),
        // Consultations this month
        this.prisma.consultation.count({
          where: {
            doctorId,
            date: { gte: startOfMonth },
          },
        }),
        // Pending access requests
        this.prisma.accessRequest.count({
          where: {
            doctorId,
            status: 'pending',
          },
        }),
      ]);

    return {
      totalPatients,
      totalConsultations,
      consultationsThisMonth,
      pendingRequests,
    };
  }
}
