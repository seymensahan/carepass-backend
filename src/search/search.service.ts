import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Recherche globale sur patients et medecins.
   */
  async globalSearch(query: string, limit: number, user: any) {
    const results: { patients: any[]; doctors: any[] } = {
      patients: [],
      doctors: [],
    };

    // Recherche de patients (selon role)
    if (
      user.role === 'doctor' ||
      user.role === 'institution_admin' ||
      user.role === 'super_admin'
    ) {
      results.patients = await this.searchPatientsInternal(query, limit, user);
    }

    // Recherche de medecins (tous les utilisateurs authentifies)
    results.doctors = await this.searchDoctorsInternal(query, limit);

    return { success: true, data: results };
  }

  /**
   * Recherche de patients par nom, prenom, carepassId, ville.
   * Roles : doctor (avec acces), institution_admin, super_admin.
   */
  async searchPatients(query: string, limit: number, user: any) {
    const patients = await this.searchPatientsInternal(query, limit, user);

    return {
      success: true,
      data: patients,
      meta: { total: patients.length, limit },
    };
  }

  /**
   * Recherche de medecins par nom, prenom, specialite, ville.
   * Tous les utilisateurs authentifies.
   */
  async searchDoctors(query: string, limit: number) {
    const doctors = await this.searchDoctorsInternal(query, limit);

    return {
      success: true,
      data: doctors,
      meta: { total: doctors.length, limit },
    };
  }

  /**
   * Recherche interne de patients.
   */
  private async searchPatientsInternal(query: string, limit: number, user: any) {
    const whereBase: any = {
      OR: [
        { user: { firstName: { contains: query, mode: 'insensitive' } } },
        { user: { lastName: { contains: query, mode: 'insensitive' } } },
        { carepassId: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
      ],
    };

    // Si le role est doctor, ne montrer que les patients auxquels il a acces
    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        return [];
      }

      const activeGrants = await this.prisma.accessGrant.findMany({
        where: { doctorId: doctor.id, isActive: true },
        select: { patientId: true },
      });
      const allowedPatientIds = activeGrants.map((g) => g.patientId);

      whereBase.id = { in: allowedPatientIds };
    }

    // Si institution_admin, montrer les patients vus par les medecins de l'institution
    if (user.role === 'institution_admin') {
      const institution = await this.prisma.institution.findFirst({
        where: { adminUserId: user.id },
      });
      if (!institution) {
        return [];
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
      const patientIds = consultations.map((c) => c.patientId);

      whereBase.id = { in: patientIds };
    }

    // super_admin voit tout

    return this.prisma.patient.findMany({
      where: whereBase,
      take: limit,
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
  }

  /**
   * Recherche interne de medecins.
   */
  private async searchDoctorsInternal(query: string, limit: number) {
    return this.prisma.doctor.findMany({
      where: {
        OR: [
          { user: { firstName: { contains: query, mode: 'insensitive' } } },
          { user: { lastName: { contains: query, mode: 'insensitive' } } },
          { specialty: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
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
          select: { id: true, name: true, city: true },
        },
      },
    });
  }
}
