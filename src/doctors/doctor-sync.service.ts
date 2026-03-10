import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DoctorSyncService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get a unified view of a doctor's data across all their institutions.
   * This is the premium sync feature.
   */
  async getSyncedDashboard(doctorId: string) {
    // Get all active institutions for this doctor
    const affiliations = await this.prisma.doctorInstitution.findMany({
      where: { doctorId, isActive: true },
      include: { institution: true },
    });

    const institutionIds = affiliations.map(a => a.institutionId);

    // Get aggregated stats across all institutions
    const [
      totalConsultations,
      consultationsThisMonth,
      totalAppointments,
      upcomingAppointments,
      activeGrants,
    ] = await Promise.all([
      this.prisma.consultation.count({ where: { doctorId } }),
      this.prisma.consultation.count({
        where: {
          doctorId,
          date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      this.prisma.appointment.count({ where: { doctorId } }),
      this.prisma.appointment.findMany({
        where: { doctorId, date: { gte: new Date() }, status: { in: ['scheduled', 'confirmed'] } },
        include: { patient: { include: { user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { date: 'asc' },
        take: 20,
      }),
      this.prisma.accessGrant.count({ where: { doctorId, isActive: true } }),
    ]);

    // Group appointments by institution (via patient's consultations or just list all)
    return {
      institutions: affiliations.map(a => ({
        id: a.institution.id,
        name: a.institution.name,
        type: a.institution.type,
        city: a.institution.city,
        role: a.role,
        isPrimary: a.isPrimary,
      })),
      stats: {
        totalConsultations,
        consultationsThisMonth,
        totalAppointments,
        totalPatients: activeGrants,
        institutionCount: affiliations.length,
      },
      upcomingAppointments: upcomingAppointments.map(a => ({
        id: a.id,
        date: a.date,
        duration: a.duration,
        type: a.type,
        reason: a.reason,
        status: a.status,
        patientName: a.patient?.user ? `${a.patient.user.firstName} ${a.patient.user.lastName}` : '',
      })),
    };
  }

  /**
   * Get consultations across all institutions for a doctor
   */
  async getSyncedConsultations(doctorId: string, limit = 50) {
    return this.prisma.consultation.findMany({
      where: { doctorId },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { institution: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  /**
   * Get appointments across all institutions for a doctor
   */
  async getSyncedAppointments(doctorId: string, limit = 50) {
    return this.prisma.appointment.findMany({
      where: { doctorId },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { date: 'asc' },
      take: limit,
    });
  }
}
