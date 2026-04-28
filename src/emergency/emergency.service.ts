import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class EmergencyService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // Generate or ensure emergency token for a patient
  // ---------------------------------------------------------------------------
  async ensureEmergencyToken(patientId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, emergencyToken: true },
    });
    if (!patient) throw new NotFoundException('Patient non trouvé');
    if (patient.emergencyToken) return patient.emergencyToken;

    const token = randomBytes(16).toString('hex');
    await this.prisma.patient.update({
      where: { id: patientId },
      data: { emergencyToken: token },
    });
    return token;
  }

  // ---------------------------------------------------------------------------
  // GET /emergency/me/token — get or create token for current user's patient
  // ---------------------------------------------------------------------------
  async getMyEmergencyToken(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true, emergencyToken: true, carypassId: true },
    });
    if (!patient) throw new NotFoundException('Profil patient non trouvé');

    let token = patient.emergencyToken;
    if (!token) {
      token = randomBytes(16).toString('hex');
      await this.prisma.patient.update({ where: { id: patient.id }, data: { emergencyToken: token } });
    }

    return { success: true, data: { token, carypassId: patient.carypassId } };
  }

  // ---------------------------------------------------------------------------
  // GET /emergency/dependents/:dependentId/token — token for a dependent
  // Only the guardian can get it
  // ---------------------------------------------------------------------------
  async getDependentEmergencyToken(userId: string, dependentId: string) {
    const guardianPatient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!guardianPatient) throw new NotFoundException('Tuteur non trouvé');

    const guardianship = await this.prisma.legalGuardian.findUnique({
      where: {
        dependentId_guardianPatientId: { dependentId, guardianPatientId: guardianPatient.id },
      },
    });
    if (!guardianship || (!guardianship.canManage && !guardianship.readOnlyAfterTransfer)) {
      throw new ForbiddenException('Vous n\'êtes pas tuteur de ce dépendant');
    }

    const token = await this.ensureEmergencyToken(dependentId);
    const dependent = await this.prisma.patient.findUnique({
      where: { id: dependentId },
      select: { carypassId: true },
    });

    return { success: true, data: { token, carypassId: dependent?.carypassId } };
  }

  /**
   * Recuperer les donnees d'urgence d'un patient par son token d'urgence.
   * Route publique — aucune authentification requise.
   * Ne retourne PAS de donnees sensibles (pas d'adresse, pas d'email, pas de carypassId).
   */
  async getEmergencyData(token: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { emergencyToken: token },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        allergies: {
          select: {
            name: true,
            severity: true,
            reaction: true,
          },
        },
        medicalConditions: {
          select: {
            name: true,
            status: true,
            treatment: true,
          },
        },
        emergencyContacts: {
          select: {
            name: true,
            relationship: true,
            phone: true,
            email: true,
            isPrimary: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Token d\'urgence invalide ou patient non trouve');
    }

    // Also return dependents (minors) managed by this patient — useful when a parent's QR
    // is scanned: first responders see the parent's info + the children's critical info
    const guardianships = await this.prisma.legalGuardian.findMany({
      where: { guardianPatientId: patient.id, canManage: true },
      include: {
        dependent: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            allergies: { select: { name: true, severity: true } },
            medicalConditions: { select: { name: true } },
          },
        },
      },
    });

    const dependents = guardianships.map((g) => ({
      firstName: g.dependent.user.firstName,
      lastName: g.dependent.user.lastName,
      dateOfBirth: g.dependent.dateOfBirth,
      gender: g.dependent.gender,
      bloodGroup: g.dependent.bloodGroup,
      genotype: g.dependent.genotype,
      allergies: g.dependent.allergies,
      conditions: g.dependent.medicalConditions,
      relationship: g.relationship,
    }));

    return {
      success: true,
      data: {
        // Expose the carypassId so authenticated apps (doctor scanning the
        // patient's emergency QR) can resolve token → carypassId and then
        // request access via the standard flow. The carypassId alone grants
        // no privileges — same level of sensitivity as the data already
        // returned (allergies, conditions, contacts).
        carypassId: patient.carypassId,
        firstName: patient.user.firstName,
        lastName: patient.user.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup,
        genotype: patient.genotype,
        allergies: patient.allergies,
        medicalConditions: patient.medicalConditions,
        emergencyContacts: patient.emergencyContacts,
        dependents,
      },
    };
  }
}
