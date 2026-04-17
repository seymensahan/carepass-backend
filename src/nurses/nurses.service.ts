import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ExecuteCarePlanItemDto } from './dto/execute-care-plan-item.dto';
import { AddVitalNurseDto } from './dto/add-vital-nurse.dto';

@Injectable()
export class NursesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async getNurse(userId: string) {
    const nurse = await this.prisma.nurse.findUnique({
      where: { userId },
      include: { user: { select: { firstName: true, lastName: true } }, institution: { select: { id: true, name: true } } },
    });
    if (!nurse) throw new NotFoundException('Profil infirmier non trouvé');
    return nurse;
  }

  private async ensureHospInstitution(hospitalisationId: string, institutionId: string | null) {
    const hosp = await this.prisma.hospitalisation.findUnique({
      where: { id: hospitalisationId },
      select: { institutionId: true },
    });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (!institutionId || hosp.institutionId !== institutionId) {
      throw new ForbiddenException('Cette hospitalisation ne fait pas partie de votre institution');
    }
    return hosp;
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    return this.getNurse(userId);
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    const nurse = await this.getNurse(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only count hospitalisations assigned to this nurse
    const assignedFilter = {
      institutionId: nurse.institutionId,
      status: 'en_cours' as const,
      nurseAssignments: { some: { nurseId: nurse.id } },
    };

    const [activeHospitalisations, pendingTasks, completedToday] = await Promise.all([
      this.prisma.hospitalisation.count({ where: assignedFilter }),
      this.prisma.carePlanItem.count({
        where: {
          hospitalisation: assignedFilter,
          isActive: true,
          executions: { none: {} },
        },
      }),
      this.prisma.carePlanExecution.count({
        where: { nurseId: nurse.id, executedAt: { gte: today } },
      }),
    ]);

    return {
      activeHospitalisations,
      pendingTasks,
      completedToday,
      nurseName: `${nurse.user.firstName} ${nurse.user.lastName}`,
      institutionName: nurse.institution?.name ?? null,
    };
  }

  // ─── Hospitalisations de l'institution ────────────────────────────────────

  async getInstitutionHospitalisations(userId: string, activeOnly = true) {
    const nurse = await this.getNurse(userId);
    // Only show hospitalisations explicitly assigned to this nurse
    const where: any = {
      institutionId: nurse.institutionId,
      nurseAssignments: { some: { nurseId: nurse.id } },
    };
    if (activeOnly) where.status = 'en_cours';

    return this.prisma.hospitalisation.findMany({
      where,
      include: {
        patient: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        carePlanItems: {
          where: { isActive: true },
          include: {
            executions: {
              orderBy: { executedAt: 'desc' },
              take: 1,
              include: { nurse: { include: { user: { select: { firstName: true, lastName: true } } } } },
            },
          },
        },
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { admissionDate: 'desc' },
    });
  }

  // ─── Détail d'une hospitalisation ─────────────────────────────────────────

  async getHospitalisationDetail(userId: string, hospitalisationId: string) {
    const nurse = await this.getNurse(userId);
    await this.ensureHospInstitution(hospitalisationId, nurse.institutionId);

    return this.prisma.hospitalisation.findUnique({
      where: { id: hospitalisationId },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        institution: { select: { name: true } },
        vitalSigns: { orderBy: { recordedAt: 'desc' } },
        medications: { orderBy: { administeredAt: 'desc' } },
        evolutionNotes: { orderBy: { createdAt: 'desc' } },
        carePlanItems: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: {
            executions: {
              orderBy: { executedAt: 'desc' },
              include: {
                nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
              },
            },
          },
        },
      },
    });
  }

  // ─── Exécuter une tâche du cahier de charges ──────────────────────────────

  async executeCarePlanItem(userId: string, carePlanItemId: string, dto: ExecuteCarePlanItemDto) {
    const nurse = await this.getNurse(userId);

    const item = await this.prisma.carePlanItem.findUnique({
      where: { id: carePlanItemId },
      include: { hospitalisation: { select: { institutionId: true, id: true } } },
    });
    if (!item) throw new NotFoundException('Tâche du cahier de charges non trouvée');
    if (item.hospitalisation.institutionId !== nurse.institutionId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    // Serialize customVitals into notes so they survive without requiring a
    // DB migration. Parsed back by the nurse history view via the "[Paramètres
    // personnalisés]" prefix.
    let enrichedNotes = dto.notes || '';
    if (dto.customVitals && dto.customVitals.length > 0) {
      const lines = dto.customVitals
        .filter((cv) => cv.name && cv.value)
        .map((cv) => `• ${cv.name}: ${cv.value}${cv.unit ? ' ' + cv.unit : ''}`);
      if (lines.length > 0) {
        const header = '[Paramètres personnalisés]';
        enrichedNotes = `${header}\n${lines.join('\n')}${enrichedNotes ? '\n\n' + enrichedNotes : ''}`;
      }
    }

    const execution = await this.prisma.carePlanExecution.create({
      data: {
        carePlanItemId,
        nurseId: nurse.id,
        notes: enrichedNotes || undefined,
        temperature: dto.temperature,
        systolic: dto.systolic,
        diastolic: dto.diastolic,
        heartRate: dto.heartRate,
        spO2: dto.spO2,
        glycemia: dto.glycemia,
        weight: dto.weight,
      },
      include: {
        nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    // If it's a vital check, also create a HospitalisationVital record
    if (item.type === 'vital_check' && (dto.temperature || dto.systolic || dto.heartRate || dto.spO2)) {
      await this.prisma.hospitalisationVital.create({
        data: {
          hospitalisationId: item.hospitalisation.id,
          nurseId: nurse.id,
          nurseName: `${nurse.user.firstName} ${nurse.user.lastName}`,
          temperature: dto.temperature,
          systolic: dto.systolic,
          diastolic: dto.diastolic,
          heartRate: dto.heartRate,
          spO2: dto.spO2,
          glycemia: dto.glycemia,
          weight: dto.weight,
          notes: dto.notes,
        },
      });
    }

    // If it's a medication, also create a HospitalisationMedication record
    if (item.type === 'medication' && item.medication) {
      await this.prisma.hospitalisationMedication.create({
        data: {
          hospitalisationId: item.hospitalisation.id,
          medication: item.medication,
          dosage: item.dosage,
          route: item.route || 'PO',
          nurseId: nurse.id,
          administeredBy: `${nurse.user.firstName} ${nurse.user.lastName}`,
          notes: dto.notes,
        },
      });
    }

    return execution;
  }

  // ─── Ajouter des constantes vitales directement ───────────────────────────

  async addVital(userId: string, dto: AddVitalNurseDto) {
    const nurse = await this.getNurse(userId);
    await this.ensureHospInstitution(dto.hospitalisationId, nurse.institutionId);

    return this.prisma.hospitalisationVital.create({
      data: {
        hospitalisationId: dto.hospitalisationId,
        nurseId: nurse.id,
        nurseName: `${nurse.user.firstName} ${nurse.user.lastName}`,
        temperature: dto.temperature,
        systolic: dto.systolic,
        diastolic: dto.diastolic,
        heartRate: dto.heartRate,
        spO2: dto.spO2,
        glycemia: dto.glycemia,
        weight: dto.weight,
        notes: dto.notes,
      },
    });
  }

  // ─── Stats pour le dashboard ──────────────────────────────────────────────

  async getMyExecutions(userId: string, days = 7) {
    const nurse = await this.getNurse(userId);
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.carePlanExecution.findMany({
      where: { nurseId: nurse.id, executedAt: { gte: since } },
      include: {
        carePlanItem: {
          select: { title: true, type: true, hospitalisation: {
            select: { patient: { include: { user: { select: { firstName: true, lastName: true } } } } },
          }},
        },
      },
      orderBy: { executedAt: 'desc' },
    });
  }

  async getPendingTasks(userId: string) {
    const nurse = await this.getNurse(userId);

    // Get all active care plan items for hospitalisations assigned to this nurse
    // that have NOT been executed yet
    const items = await this.prisma.carePlanItem.findMany({
      where: {
        isActive: true,
        hospitalisation: {
          status: 'en_cours',
          institutionId: nurse.institutionId,
          nurseAssignments: { some: { nurseId: nurse.id } },
        },
        executions: { none: {} },
      },
      include: {
        hospitalisation: {
          select: {
            id: true,
            room: true,
            patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      type: item.type,
      dosage: item.dosage,
      frequency: item.frequency,
      scheduledTimes: item.scheduledTimes,
      hospitalisationId: item.hospitalisationId,
      patientName: item.hospitalisation?.patient?.user
        ? `${item.hospitalisation.patient.user.firstName} ${item.hospitalisation.patient.user.lastName}`
        : '',
      room: item.hospitalisation?.room || '',
    }));
  }

  // =========================================================================
  // My patients — consultations initiated + approved access requests
  // =========================================================================
  async getMyPatients(userId: string) {
    const nurse = await this.getNurse(userId);

    // Get all unique patients that this nurse has interacted with:
    // 1. Via consultations she initiated
    // 2. Via approved access requests
    const [consultations, approvedRequests] = await Promise.all([
      this.prisma.consultation.findMany({
        where: { initiatedByNurseId: nurse.id },
        select: {
          patientId: true,
          date: true,
          patient: {
            include: {
              user: {
                select: { firstName: true, lastName: true, avatarUrl: true, phone: true },
              },
            },
          },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.accessRequest.findMany({
        where: { nurseId: nurse.id, status: 'approved' },
        include: {
          patient: {
            include: {
              user: {
                select: { firstName: true, lastName: true, avatarUrl: true, phone: true },
              },
            },
          },
        },
        orderBy: { respondedAt: 'desc' },
      }),
    ]);

    // Deduplicate by patientId, keeping most recent interaction
    const patientMap = new Map<string, any>();

    for (const c of consultations) {
      if (!patientMap.has(c.patientId)) {
        patientMap.set(c.patientId, {
          id: c.patient.id,
          carypassId: c.patient.carypassId,
          firstName: c.patient.user.firstName,
          lastName: c.patient.user.lastName,
          phone: c.patient.user.phone,
          avatarUrl: c.patient.user.avatarUrl,
          lastInteraction: c.date,
          source: 'consultation',
        });
      }
    }

    for (const r of approvedRequests) {
      if (!patientMap.has(r.patientId)) {
        patientMap.set(r.patientId, {
          id: r.patient.id,
          carypassId: r.patient.carypassId,
          firstName: r.patient.user.firstName,
          lastName: r.patient.user.lastName,
          phone: r.patient.user.phone,
          avatarUrl: r.patient.user.avatarUrl,
          lastInteraction: r.respondedAt || r.createdAt,
          source: 'access_request',
        });
      }
    }

    return Array.from(patientMap.values()).sort(
      (a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime(),
    );
  }

  // =========================================================================
  // Patient lookup by CaryPass ID (for QR scan)
  // =========================================================================
  async lookupPatientByCarypassId(carypassId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { carypassId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
          },
        },
        allergies: { select: { id: true, name: true, severity: true } },
        medicalConditions: {
          where: { status: 'active' },
          select: { id: true, name: true, notes: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient non trouvé avec cet identifiant CaryPass');
    }

    return {
      id: patient.id,
      carypassId: patient.carypassId,
      firstName: patient.user.firstName,
      lastName: patient.user.lastName,
      phone: patient.user.phone,
      avatarUrl: patient.user.avatarUrl,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      genotype: patient.genotype,
      allergies: patient.allergies,
      medicalConditions: patient.medicalConditions,
    };
  }
}
