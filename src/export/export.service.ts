import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ExportFilterDto } from './dto/export-filter.dto';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Exporter la liste des patients.
   * Filtre par role : doctor (ses patients), institution_admin (patients de l'institution), super_admin (tous).
   */
  async exportPatients(filters: ExportFilterDto, user: any) {
    const where: Prisma.PatientWhereInput = {};

    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }

      const activeGrants = await this.prisma.accessGrant.findMany({
        where: { doctorId: doctor.id, isActive: true },
        select: { patientId: true },
      });
      where.id = { in: activeGrants.map((g) => g.patientId) };
    } else if (user.role === 'institution_admin') {
      const institution = await this.prisma.institution.findFirst({
        where: { adminUserId: user.id },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvee');
      }

      const doctors = await this.prisma.doctor.findMany({
        where: { institutionId: institution.id },
        select: { id: true },
      });
      const doctorIds = doctors.map((d) => d.id);

      const consultations = await this.prisma.consultation.findMany({
        where: { doctorId: { in: doctorIds } },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      where.id = { in: consultations.map((c) => c.patientId) };
    }
    // super_admin : pas de filtre, exporte tous les patients

    const patients = await this.prisma.patient.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    // TODO: Ajouter la generation CSV quand format === 'csv'
    return {
      success: true,
      data: patients,
      meta: { total: patients.length, format: filters.format || 'json' },
    };
  }

  /**
   * Exporter les consultations avec filtre par date.
   */
  async exportConsultations(filters: ExportFilterDto, user: any) {
    const where: Prisma.ConsultationWhereInput = {};

    // Filtre par date
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        (where.date as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        (where.date as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
      }
    }

    // Filtre par role
    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }
      where.doctorId = doctor.id;
    } else if (user.role === 'institution_admin') {
      const institution = await this.prisma.institution.findFirst({
        where: { adminUserId: user.id },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvee');
      }

      const doctors = await this.prisma.doctor.findMany({
        where: { institutionId: institution.id },
        select: { id: true },
      });
      where.doctorId = { in: doctors.map((d) => d.id) };
    }

    const consultations = await this.prisma.consultation.findMany({
      where,
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    // TODO: Ajouter la generation CSV quand format === 'csv'
    return {
      success: true,
      data: consultations,
      meta: { total: consultations.length, format: filters.format || 'json' },
    };
  }

  /**
   * Exporter les resultats de laboratoire avec filtre par date.
   */
  async exportLabResults(filters: ExportFilterDto, user: any) {
    const where: Prisma.LabResultWhereInput = {};

    // Filtre par date
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        (where.date as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        (where.date as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
      }
    }

    // Filtre par role
    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }

      // Medecin : exporter les resultats des patients auxquels il a acces
      const activeGrants = await this.prisma.accessGrant.findMany({
        where: { doctorId: doctor.id, isActive: true },
        select: { patientId: true },
      });
      where.patientId = { in: activeGrants.map((g) => g.patientId) };
    } else if (user.role === 'lab') {
      // Lab : exporter ses propres uploads
      where.uploadedById = user.id;
    }

    const labResults = await this.prisma.labResult.findMany({
      where,
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        items: true,
      },
      orderBy: { date: 'desc' },
    });

    // TODO: Ajouter la generation CSV quand format === 'csv'
    return {
      success: true,
      data: labResults,
      meta: { total: labResults.length, format: filters.format || 'json' },
    };
  }

  /**
   * Exporter les statistiques agregees.
   * Super_admin uniquement.
   */
  async exportStatistics(filters: ExportFilterDto) {
    const now = new Date();
    const months: { month: string; consultations: number; labResults: number; newPatients: number }[] = [];

    // Generer les statistiques pour les 12 derniers mois
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const monthLabel = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

      const [consultations, labResults, newPatients] = await Promise.all([
        this.prisma.consultation.count({
          where: { date: { gte: monthStart, lt: monthEnd } },
        }),
        this.prisma.labResult.count({
          where: { date: { gte: monthStart, lt: monthEnd } },
        }),
        this.prisma.patient.count({
          where: { createdAt: { gte: monthStart, lt: monthEnd } },
        }),
      ]);

      months.push({ month: monthLabel, consultations, labResults, newPatients });
    }

    // TODO: Ajouter la generation CSV quand format === 'csv'
    return {
      success: true,
      data: { monthlyStats: months },
      meta: { format: filters.format || 'json' },
    };
  }
}
