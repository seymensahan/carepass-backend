import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreateInsuranceCompanyDto } from './dto/create-insurance-company.dto';
import { UpdateInsuranceCompanyDto } from './dto/update-insurance-company.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { InsuranceFilterDto } from './dto/insurance-filter.dto';
import { ClaimFilterDto } from './dto/claim-filter.dto';

@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaClient) {}

  // ===================== COMPANIES =====================

  /**
   * Liste paginee des compagnies d'assurance.
   */
  async findAllCompanies(filters: InsuranceFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.InsuranceCompanyWhereInput = {};

    const [data, total] = await Promise.all([
      this.prisma.insuranceCompany.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.insuranceCompany.count({ where }),
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
   * Obtenir une compagnie d'assurance par ID.
   */
  async findOneCompany(id: string) {
    const company = await this.prisma.insuranceCompany.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
        claims: {
          take: 10,
          orderBy: { submittedAt: 'desc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Compagnie d\'assurance non trouvee');
    }

    return { success: true, data: company };
  }

  /**
   * Creer une compagnie d'assurance. Reserve au super_admin.
   */
  async createCompany(dto: CreateInsuranceCompanyDto) {
    // Verifier l'unicite du numero d'enregistrement s'il est fourni
    if (dto.registrationNumber) {
      const existing = await this.prisma.insuranceCompany.findUnique({
        where: { registrationNumber: dto.registrationNumber },
      });
      if (existing) {
        throw new BadRequestException('Une compagnie avec ce numero d\'enregistrement existe deja');
      }
    }

    const company = await this.prisma.insuranceCompany.create({
      data: {
        name: dto.name,
        registrationNumber: dto.registrationNumber,
        address: dto.address,
        city: dto.city,
        phone: dto.phone,
        email: dto.email,
      },
    });

    return { success: true, data: company };
  }

  /**
   * Mettre a jour une compagnie d'assurance.
   */
  async updateCompany(id: string, dto: UpdateInsuranceCompanyDto) {
    const company = await this.prisma.insuranceCompany.findUnique({ where: { id } });

    if (!company) {
      throw new NotFoundException('Compagnie d\'assurance non trouvee');
    }

    // Verifier l'unicite du numero d'enregistrement si modifie
    if (dto.registrationNumber && dto.registrationNumber !== company.registrationNumber) {
      const existing = await this.prisma.insuranceCompany.findUnique({
        where: { registrationNumber: dto.registrationNumber },
      });
      if (existing) {
        throw new BadRequestException('Une compagnie avec ce numero d\'enregistrement existe deja');
      }
    }

    const updated = await this.prisma.insuranceCompany.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.registrationNumber !== undefined && { registrationNumber: dto.registrationNumber }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      },
    });

    return { success: true, data: updated };
  }

  // ===================== PATIENTS =====================

  /**
   * Liste des patients assures lies a une compagnie (via les reclamations).
   */
  async findInsuredPatients(insuranceCompanyId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Trouver les patients distincts lies a cette compagnie via les reclamations
    const claims = await this.prisma.insuranceClaim.findMany({
      where: { insuranceCompanyId },
      select: { patientId: true },
      distinct: ['patientId'],
    });

    const patientIds = claims.map((c) => c.patientId);
    const total = patientIds.length;

    const paginatedIds = patientIds.slice(skip, skip + limit);

    const data = await this.prisma.patient.findMany({
      where: { id: { in: paginatedIds } },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
        },
      },
    });

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
   * Detail d'un patient assure avec l'historique des reclamations.
   */
  async findInsuredPatientDetail(patientId: string, insuranceCompanyId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient non trouve');
    }

    const claims = await this.prisma.insuranceClaim.findMany({
      where: {
        patientId,
        insuranceCompanyId,
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        consultation: true,
      },
    });

    return {
      success: true,
      data: {
        ...patient,
        claims,
      },
    };
  }

  // ===================== CLAIMS =====================

  /**
   * Liste paginee des reclamations avec filtres.
   */
  async findAllClaims(insuranceCompanyId: string, filters: ClaimFilterDto) {
    const { page = 1, limit = 20, status, patientId, dateFrom, dateTo } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.InsuranceClaimWhereInput = {
      insuranceCompanyId,
    };

    if (status) {
      where.status = status;
    }

    if (patientId) {
      where.patientId = patientId;
    }

    if (dateFrom || dateTo) {
      where.submittedAt = {};
      if (dateFrom) {
        (where.submittedAt as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      }
      if (dateTo) {
        (where.submittedAt as Prisma.DateTimeFilter).lte = new Date(dateTo);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.insuranceClaim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          patient: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
          consultation: true,
        },
      }),
      this.prisma.insuranceClaim.count({ where }),
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
   * Obtenir une reclamation par ID.
   */
  async findOneClaim(id: string) {
    const claim = await this.prisma.insuranceClaim.findUnique({
      where: { id },
      include: {
        insuranceCompany: true,
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
            },
          },
        },
        consultation: true,
      },
    });

    if (!claim) {
      throw new NotFoundException('Reclamation non trouvee');
    }

    return { success: true, data: claim };
  }

  /**
   * Creer une reclamation d'assurance.
   */
  async createClaim(insuranceCompanyId: string, dto: CreateClaimDto) {
    // Verifier que le patient existe
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) {
      throw new NotFoundException('Patient non trouve');
    }

    // Verifier que la consultation existe si fournie
    if (dto.consultationId) {
      const consultation = await this.prisma.consultation.findUnique({
        where: { id: dto.consultationId },
      });
      if (!consultation) {
        throw new NotFoundException('Consultation non trouvee');
      }
    }

    const claim = await this.prisma.insuranceClaim.create({
      data: {
        insuranceCompanyId,
        patientId: dto.patientId,
        consultationId: dto.consultationId,
        amount: dto.amount,
        description: dto.description,
        status: 'pending',
      },
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
        consultation: true,
      },
    });

    return { success: true, data: claim };
  }

  /**
   * Mettre a jour le statut d'une reclamation.
   * Enregistre processedAt quand le statut passe a approved, rejected ou paid.
   */
  async updateClaimStatus(id: string, dto: UpdateClaimStatusDto) {
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { id } });

    if (!claim) {
      throw new NotFoundException('Reclamation non trouvee');
    }

    const updated = await this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: dto.status,
        processedAt: new Date(),
      },
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
        consultation: true,
      },
    });

    return { success: true, data: updated };
  }

  // ===================== DASHBOARD =====================

  /**
   * Tableau de bord de la compagnie d'assurance.
   */
  async getDashboard(insuranceCompanyId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPatientsResult, pendingClaims, approvedThisMonth, totalPaidResult] =
      await Promise.all([
        // Nombre total de patients distincts
        this.prisma.insuranceClaim.findMany({
          where: { insuranceCompanyId },
          select: { patientId: true },
          distinct: ['patientId'],
        }),
        // Reclamations en attente
        this.prisma.insuranceClaim.count({
          where: { insuranceCompanyId, status: 'pending' },
        }),
        // Reclamations approuvees ce mois
        this.prisma.insuranceClaim.count({
          where: {
            insuranceCompanyId,
            status: 'approved',
            processedAt: { gte: startOfMonth },
          },
        }),
        // Montant total paye
        this.prisma.insuranceClaim.aggregate({
          where: { insuranceCompanyId, status: 'paid' },
          _sum: { amount: true },
        }),
      ]);

    return {
      success: true,
      data: {
        totalPatients: totalPatientsResult.length,
        pendingClaims,
        approvedThisMonth,
        totalPaidAmount: totalPaidResult._sum.amount || 0,
      },
    };
  }
}
