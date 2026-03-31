import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class EmergencyService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Recuperer les donnees d'urgence d'un patient par son token d'urgence.
   * Route publique — aucune authentification requise.
   * Ne retourne PAS de donnees sensibles (pas d'adresse, pas d'email, pas de carepassId).
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

    return {
      success: true,
      data: {
        firstName: patient.user.firstName,
        lastName: patient.user.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup,
        genotype: patient.genotype,
        allergies: patient.allergies,
        medicalConditions: patient.medicalConditions,
        emergencyContacts: patient.emergencyContacts,
      },
    };
  }
}
