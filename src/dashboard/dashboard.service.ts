import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Tableau de bord du patient.
   */
  async getPatientDashboard(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Profil patient non trouve');
    }

    const now = new Date();

    const [
      totalConsultations,
      totalLabResults,
      totalVaccinations,
      totalAllergies,
      upcomingAppointments,
      unreadNotifications,
      recentConsultations,
    ] = await Promise.all([
      this.prisma.consultation.count({ where: { patientId: patient.id } }),
      this.prisma.labResult.count({ where: { patientId: patient.id } }),
      this.prisma.vaccination.count({ where: { patientId: patient.id } }),
      this.prisma.allergy.count({ where: { patientId: patient.id } }),
      this.prisma.appointment.findMany({
        where: {
          patientId: patient.id,
          date: { gt: now },
          status: { in: ['scheduled', 'confirmed'] },
        },
        take: 5,
        orderBy: { date: 'asc' },
        include: {
          doctor: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
      this.prisma.consultation.findMany({
        where: { patientId: patient.id },
        take: 5,
        orderBy: { date: 'desc' },
        include: {
          doctor: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalConsultations,
        totalLabResults,
        totalVaccinations,
        totalAllergies,
        upcomingAppointments,
        unreadNotifications,
        recentConsultations,
      },
    };
  }

  /**
   * Tableau de bord du medecin.
   */
  async getDoctorDashboard(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
    });

    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalPatients,
      totalConsultations,
      consultationsThisMonth,
      pendingRequests,
      upcomingAppointments,
      recentConsultations,
    ] = await Promise.all([
      this.prisma.accessGrant.count({
        where: { doctorId: doctor.id, isActive: true },
      }),
      this.prisma.consultation.count({
        where: { doctorId: doctor.id },
      }),
      this.prisma.consultation.count({
        where: {
          doctorId: doctor.id,
          date: { gte: firstDayOfMonth },
        },
      }),
      this.prisma.accessRequest.count({
        where: { doctorId: doctor.id, status: 'pending' },
      }),
      this.prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          date: { gt: now },
          status: { in: ['scheduled', 'confirmed'] },
        },
        take: 5,
        orderBy: { date: 'asc' },
        include: {
          patient: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
      }),
      this.prisma.consultation.findMany({
        where: { doctorId: doctor.id },
        take: 5,
        orderBy: { date: 'desc' },
        include: {
          patient: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalPatients,
        totalConsultations,
        consultationsThisMonth,
        pendingRequests,
        upcomingAppointments,
        recentConsultations,
      },
    };
  }

  /**
   * Tableau de bord de l'institution.
   */
  async getInstitutionDashboard(userId: string) {
    const institution = await this.prisma.institution.findFirst({
      where: { adminUserId: userId },
    });

    if (!institution) {
      throw new NotFoundException('Institution non trouvee');
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all doctor IDs in this institution
    const institutionDoctors = await this.prisma.doctor.findMany({
      where: { institutionId: institution.id },
      select: { id: true },
    });
    const doctorIds = institutionDoctors.map((d) => d.id);

    const [
      totalDoctors,
      totalPatients,
      consultationsToday,
      consultationsThisMonth,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.doctor.count({ where: { institutionId: institution.id } }),
      this.prisma.consultation.findMany({
        where: { doctorId: { in: doctorIds } },
        select: { patientId: true },
        distinct: ['patientId'],
      }).then((results) => results.length),
      this.prisma.consultation.count({
        where: {
          doctorId: { in: doctorIds },
          date: { gte: startOfToday, lt: endOfToday },
        },
      }),
      this.prisma.consultation.count({
        where: {
          doctorId: { in: doctorIds },
          date: { gte: firstDayOfMonth },
        },
      }),
      this.prisma.doctor.count({
        where: { institutionId: institution.id, isVerified: false },
      }),
    ]);

    return {
      success: true,
      data: {
        totalDoctors,
        totalPatients,
        consultationsToday,
        consultationsThisMonth,
        pendingVerifications,
      },
    };
  }

  /**
   * Tableau de bord du laboratoire.
   */
  async getLabDashboard(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [
      totalUploads,
      pendingResults,
      validatedToday,
      recentUploads,
    ] = await Promise.all([
      this.prisma.labResult.count({ where: { uploadedById: userId } }),
      this.prisma.labResult.count({
        where: { uploadedById: userId, status: 'pending' },
      }),
      this.prisma.labResult.count({
        where: {
          uploadedById: userId,
          status: 'validated',
          date: { gte: startOfToday, lt: endOfToday },
        },
      }),
      this.prisma.labResult.findMany({
        where: { uploadedById: userId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalUploads,
        pendingResults,
        validatedToday,
        recentUploads,
      },
    };
  }

  /**
   * Tableau de bord de l'assurance.
   */
  async getInsuranceDashboard(userId: string) {
    const insuranceCompany = await this.prisma.insuranceCompany.findFirst({
      where: { userId },
    });

    if (!insuranceCompany) {
      throw new NotFoundException('Compagnie d\'assurance non trouvee');
    }

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalClaims,
      pendingClaims,
      approvedThisMonth,
      totalPaidResult,
      recentClaims,
    ] = await Promise.all([
      this.prisma.insuranceClaim.count({
        where: { insuranceCompanyId: insuranceCompany.id },
      }),
      this.prisma.insuranceClaim.count({
        where: { insuranceCompanyId: insuranceCompany.id, status: 'pending' },
      }),
      this.prisma.insuranceClaim.count({
        where: {
          insuranceCompanyId: insuranceCompany.id,
          status: 'approved',
          submittedAt: { gte: firstDayOfMonth },
        },
      }),
      this.prisma.insuranceClaim.aggregate({
        where: { insuranceCompanyId: insuranceCompany.id, status: 'paid' },
        _sum: { amount: true },
      }),
      this.prisma.insuranceClaim.findMany({
        where: { insuranceCompanyId: insuranceCompany.id },
        take: 10,
        orderBy: { submittedAt: 'desc' },
        include: {
          patient: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalClaims,
        pendingClaims,
        approvedThisMonth,
        totalPaidAmount: totalPaidResult._sum.amount || 0,
        recentClaims,
      },
    };
  }

  /**
   * Tableau de bord super admin.
   */
  async getAdminDashboard() {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalPatients,
      totalDoctors,
      totalInstitutions,
      verifiedDoctors,
      verifiedInstitutions,
      activeSubscriptions,
      usersThisMonth,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.patient.count(),
      this.prisma.doctor.count(),
      this.prisma.institution.count(),
      this.prisma.doctor.count({ where: { isVerified: true } }),
      this.prisma.institution.count({ where: { isVerified: true } }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.user.count({ where: { createdAt: { gte: firstDayOfMonth } } }),
    ]);

    return {
      success: true,
      data: {
        totalUsers,
        totalPatients,
        totalDoctors,
        totalInstitutions,
        verifiedDoctors,
        verifiedInstitutions,
        activeSubscriptions,
        usersThisMonth,
      },
    };
  }
}
