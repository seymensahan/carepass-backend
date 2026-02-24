import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { InstitutionFilterDto } from './dto/institution-filter.dto';

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Liste paginee des institutions avec filtres.
   */
  async findAll(filters: InstitutionFilterDto) {
    const { page = 1, limit = 20, search, type, city, verified } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.InstitutionWhereInput = {};

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (type) {
      where.type = type;
    }

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (verified !== undefined) {
      where.isVerified = verified === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.institution.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          admin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { doctors: true },
          },
        },
      }),
      this.prisma.institution.count({ where }),
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

  /**
   * Obtenir une institution par ID.
   */
  async findOne(id: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id },
      include: {
        admin: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
        },
        doctors: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
        _count: {
          select: { labResults: true },
        },
      },
    });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    return { success: true, data: institution };
  }

  /**
   * Creer une nouvelle institution. Reserve au super_admin.
   */
  async create(dto: CreateInstitutionDto) {
    // Verifier l'unicite du numero d'enregistrement s'il est fourni
    if (dto.registrationNumber) {
      const existing = await this.prisma.institution.findUnique({
        where: { registrationNumber: dto.registrationNumber },
      });
      if (existing) {
        throw new BadRequestException('Une institution avec ce numero d\'enregistrement existe deja');
      }
    }

    // Verifier que l'adminUserId existe s'il est fourni
    if (dto.adminUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.adminUserId } });
      if (!user) {
        throw new NotFoundException('Utilisateur administrateur non trouve');
      }
    }

    const institution = await this.prisma.institution.create({
      data: {
        name: dto.name,
        type: dto.type,
        registrationNumber: dto.registrationNumber,
        address: dto.address,
        city: dto.city,
        region: dto.region,
        phone: dto.phone,
        email: dto.email,
        adminUserId: dto.adminUserId,
      },
      include: {
        admin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return { success: true, data: institution };
  }

  /**
   * Mettre a jour une institution.
   */
  async update(id: string, dto: UpdateInstitutionDto) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    // Verifier l'unicite du numero d'enregistrement si modifie
    if (dto.registrationNumber && dto.registrationNumber !== institution.registrationNumber) {
      const existing = await this.prisma.institution.findUnique({
        where: { registrationNumber: dto.registrationNumber },
      });
      if (existing) {
        throw new BadRequestException('Une institution avec ce numero d\'enregistrement existe deja');
      }
    }

    const updated = await this.prisma.institution.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.registrationNumber !== undefined && { registrationNumber: dto.registrationNumber }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.region !== undefined && { region: dto.region }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.adminUserId !== undefined && { adminUserId: dto.adminUserId }),
      },
      include: {
        admin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Verifier une institution (isVerified = true). Reserve au super_admin.
   */
  async verify(id: string) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    const updated = await this.prisma.institution.update({
      where: { id },
      data: { isVerified: true },
    });

    return { success: true, data: updated, message: 'Institution verifiee avec succes' };
  }

  /**
   * Liste paginee des membres (medecins) d'une institution.
   */
  async findMembers(id: string, page: number = 1, limit: number = 20) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.doctor.findMany({
        where: { institutionId: id },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.doctor.count({ where: { institutionId: id } }),
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

  /**
   * Statistiques de l'institution.
   */
  async getStats(id: string) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalDoctors, totalLabResults, totalConsultations, consultationsThisMonth] =
      await Promise.all([
        this.prisma.doctor.count({ where: { institutionId: id } }),
        this.prisma.labResult.count({ where: { institutionId: id } }),
        this.prisma.consultation.count({
          where: {
            doctor: { institutionId: id },
          },
        }),
        this.prisma.consultation.count({
          where: {
            doctor: { institutionId: id },
            date: { gte: startOfMonth },
          },
        }),
      ]);

    return {
      success: true,
      data: {
        totalDoctors,
        totalConsultations,
        totalLabResults,
        consultationsThisMonth,
      },
    };
  }

  /**
   * Supprimer une institution. Reserve au super_admin.
   * Verifie qu'aucun medecin n'est lie.
   */
  async remove(id: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id },
      include: { _count: { select: { doctors: true } } },
    });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    if (institution._count.doctors > 0) {
      throw new BadRequestException(
        'Impossible de supprimer cette institution : des medecins y sont encore rattaches',
      );
    }

    await this.prisma.institution.delete({ where: { id } });

    return { success: true, data: null, message: 'Institution supprimee avec succes' };
  }
}
