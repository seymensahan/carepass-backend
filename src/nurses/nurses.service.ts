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

  private async ensureHospInstitution(hospitalisationId: string, institutionId: string) {
    const hosp = await this.prisma.hospitalisation.findUnique({
      where: { id: hospitalisationId },
      select: { institutionId: true },
    });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.institutionId !== institutionId) {
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
      institutionName: nurse.institution.name,
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

    const execution = await this.prisma.carePlanExecution.create({
      data: {
        carePlanItemId,
        nurseId: nurse.id,
        notes: dto.notes,
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
}
