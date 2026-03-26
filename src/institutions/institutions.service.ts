import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { InstitutionFilterDto } from './dto/institution-filter.dto';
import { AppwriteService } from '../common/services/appwrite.service';

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appwriteService: AppwriteService,
  ) {}

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
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, isActive: true },
          },
          _count: { select: { consultations: true } },
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
   * Liste des infirmiers d'une institution.
   */
  async findNurses(id: string) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });
    if (!institution) throw new NotFoundException('Institution non trouvee');

    const nurses = await this.prisma.nurse.findMany({
      where: { institutionId: id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
    });

    return { success: true, data: nurses };
  }

  /**
   * Statistiques de l'institution.
   */
  async getStats(id: string, period: string = '30d') {
    const institution = await this.prisma.institution.findUnique({ where: { id } });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const doctorIds = (await this.prisma.doctor.findMany({
      where: { institutionId: id },
      select: { id: true },
    })).map(d => d.id);

    // Basic counts
    const [totalConsultations, totalPatients] = await Promise.all([
      this.prisma.consultation.count({
        where: { doctorId: { in: doctorIds }, date: { gte: startDate } },
      }),
      this.prisma.consultation.findMany({
        where: { doctorId: { in: doctorIds }, date: { gte: startDate } },
        select: { patientId: true },
        distinct: ['patientId'],
      }).then(r => r.length),
    ]);

    // Consultations over time (group by day)
    const allConsultations = await this.prisma.consultation.findMany({
      where: { doctorId: { in: doctorIds }, date: { gte: startDate } },
      select: { date: true, type: true, diagnosis: true, patientId: true },
    });

    const byDate: Record<string, number> = {};
    const byDiagnosis: Record<string, number> = {};
    const byDayHour: Record<string, Record<number, number>> = {};
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    for (const day of dayNames) byDayHour[day] = {};

    for (const c of allConsultations) {
      const d = new Date(c.date);
      const dateKey = d.toISOString().slice(0, 10);
      byDate[dateKey] = (byDate[dateKey] || 0) + 1;

      if (c.diagnosis) {
        byDiagnosis[c.diagnosis] = (byDiagnosis[c.diagnosis] || 0) + 1;
      }

      const dayName = dayNames[d.getDay()];
      const hour = d.getHours();
      byDayHour[dayName][hour] = (byDayHour[dayName][hour] || 0) + 1;
    }

    const consultationsOverTime = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const topDiagnoses = Object.entries(byDiagnosis)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([diagnosis, count]) => ({ diagnosis, count }));

    const activityByDayHour = dayNames.map(day => ({
      day,
      hours: byDayHour[day],
    }));

    // Gender distribution
    const patientIds = [...new Set(allConsultations.map(c => c.patientId))];
    let genderDistribution: { gender: string; count: number }[] = [];
    if (patientIds.length > 0) {
      const patients = await this.prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: { gender: true },
      });
      const genderMap: Record<string, number> = {};
      for (const p of patients) {
        const g = p.gender || 'non_specifie';
        genderMap[g] = (genderMap[g] || 0) + 1;
      }
      genderDistribution = Object.entries(genderMap).map(([gender, count]) => {
        const labels: Record<string, string> = { male: 'Hommes', female: 'Femmes', other: 'Autre', non_specifie: 'Non spécifié' };
        return { gender: labels[gender] || gender, count };
      });
    }

    // Top doctors
    const doctors = await this.prisma.doctor.findMany({
      where: { institutionId: id },
      include: {
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { consultations: true } },
      },
    });
    const topDoctors = doctors
      .map(d => ({
        name: `Dr. ${d.user.firstName} ${d.user.lastName}`,
        specialty: d.specialty || 'Généraliste',
        consultations: d._count.consultations,
        patients: 0,
        rating: 0,
      }))
      .sort((a, b) => b.consultations - a.consultations)
      .slice(0, 10);

    // Return rate: patients who had more than 1 consultation
    const patientConsultCounts: Record<string, number> = {};
    for (const c of allConsultations) {
      patientConsultCounts[c.patientId] = (patientConsultCounts[c.patientId] || 0) + 1;
    }
    const returning = Object.values(patientConsultCounts).filter(c => c > 1).length;
    const returnRate = totalPatients > 0 ? Math.round((returning / totalPatients) * 100) : 0;

    return {
      success: true,
      data: {
        totalConsultations,
        totalPatients,
        returnRate,
        consultationsOverTime,
        topDiagnoses,
        activityByDayHour,
        genderDistribution,
        topDoctors,
      },
    };
  }

  /**
   * Uploader des documents de vérification pour une institution.
   */
  async uploadDocuments(id: string, files: Express.Multer.File[]) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });
    if (!institution) {
      throw new NotFoundException('Institution non trouvée');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    const documents = [];
    for (const file of files) {
      const { fileId, url } = await this.appwriteService.uploadFile(file, 'institution-documents');
      const doc = await this.prisma.institutionDocument.create({
        data: {
          institutionId: id,
          name: file.originalname,
          type: 'autorisation_exercice',
          fileUrl: url,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });
      documents.push(doc);
    }

    return { success: true, data: documents };
  }

  /**
   * Lister les documents de vérification d'une institution.
   */
  async getDocuments(id: string) {
    const institution = await this.prisma.institution.findUnique({ where: { id } });
    if (!institution) {
      throw new NotFoundException('Institution non trouvée');
    }

    const documents = await this.prisma.institutionDocument.findMany({
      where: { institutionId: id },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: documents };
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

  // ─── Hospitalisation Nurse Assignment ───

  async getHospitalisations(institutionId: string, status?: string) {
    const where: any = { institutionId };
    if (status === 'en_cours' || status === 'terminee') {
      where.status = status;
    }

    const hospitalisations = await this.prisma.hospitalisation.findMany({
      where,
      orderBy: { admissionDate: 'desc' },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        nurseAssignments: {
          include: {
            nurse: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
          },
        },
        _count: { select: { carePlanItems: true } },
      },
    });

    return {
      success: true,
      data: hospitalisations.map((h) => ({
        id: h.id,
        patientName: `${h.patient?.user?.firstName || ''} ${h.patient?.user?.lastName || ''}`.trim(),
        doctorName: `Dr. ${h.doctor?.user?.firstName || ''} ${h.doctor?.user?.lastName || ''}`.trim(),
        room: h.room,
        bed: h.bed,
        admissionDate: h.admissionDate,
        dischargeDate: h.dischargeDate,
        reason: h.reason,
        status: h.status,
        carePlanItemsCount: h._count.carePlanItems,
        assignedNurses: h.nurseAssignments.map((a) => ({
          id: a.nurse.id,
          name: `${a.nurse.user.firstName} ${a.nurse.user.lastName}`.trim(),
          assignedAt: a.assignedAt,
        })),
      })),
    };
  }

  async assignNurseToHospitalisation(institutionId: string, hospitalisationId: string, nurseId: string) {
    // Verify hospitalisation belongs to institution
    const hosp = await this.prisma.hospitalisation.findFirst({
      where: { id: hospitalisationId, institutionId },
    });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée dans cette institution');

    // Verify nurse belongs to institution
    const nurse = await this.prisma.nurse.findFirst({
      where: { id: nurseId, institutionId },
    });
    if (!nurse) throw new NotFoundException('Infirmier non trouvé dans cette institution');

    const assignment = await this.prisma.hospitalisationNurseAssignment.upsert({
      where: {
        hospitalisationId_nurseId: { hospitalisationId, nurseId },
      },
      create: { hospitalisationId, nurseId },
      update: {},
      include: {
        nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    return {
      success: true,
      data: {
        id: assignment.nurse.id,
        name: `${assignment.nurse.user.firstName} ${assignment.nurse.user.lastName}`.trim(),
        assignedAt: assignment.assignedAt,
      },
    };
  }

  async unassignNurseFromHospitalisation(institutionId: string, hospitalisationId: string, nurseId: string) {
    const hosp = await this.prisma.hospitalisation.findFirst({
      where: { id: hospitalisationId, institutionId },
    });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée dans cette institution');

    await this.prisma.hospitalisationNurseAssignment.deleteMany({
      where: { hospitalisationId, nurseId },
    });

    return { success: true, message: 'Infirmier retiré de l\'hospitalisation' };
  }
}
