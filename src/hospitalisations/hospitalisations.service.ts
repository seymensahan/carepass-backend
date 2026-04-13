import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateHospitalisationDto } from './dto/create-hospitalisation.dto';
import { UpdateHospitalisationDto } from './dto/update-hospitalisation.dto';
import { AddVitalDto } from './dto/add-vital.dto';
import { AddMedicationDto } from './dto/add-medication.dto';
import { AddEvolutionNoteDto } from './dto/add-evolution-note.dto';
import { CreateCarePlanItemDto } from './dto/create-care-plan-item.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class HospitalisationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Notify all assigned nurses of a hospitalisation about a new task / care plan item.
   */
  private async notifyAssignedNurses(hospitalisationId: string, taskTitle: string) {
    const assignments = await this.prisma.hospitalisationNurseAssignment.findMany({
      where: { hospitalisationId },
      include: {
        nurse: { include: { user: { select: { id: true } } } },
      },
    });

    const hosp = await this.prisma.hospitalisation.findUnique({
      where: { id: hospitalisationId },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    const patientName = `${hosp?.patient?.user?.firstName ?? ''} ${hosp?.patient?.user?.lastName ?? ''}`.trim();

    await Promise.all(
      assignments.map((a) =>
        a.nurse.user?.id
          ? this.notificationsService.create(a.nurse.user.id, {
              type: 'info',
              title: 'Nouvelle tâche de soin',
              message: `${taskTitle} — Patient: ${patientName}`,
              link: `/nurse/hospitalisations/${hospitalisationId}`,
            }).catch(() => {})
          : Promise.resolve(),
      ),
    );
  }

  private async getDoctorId(userId: string): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new NotFoundException('Profil médecin non trouvé');
    return doctor.id;
  }

  private async resolvePatientId(patientId: string): Promise<string> {
    // If it looks like a CaryPass ID (e.g. CP-2025-00001), resolve to UUID
    if (patientId.startsWith('CP-')) {
      const patient = await this.prisma.patient.findUnique({ where: { carypassId: patientId } });
      if (!patient) throw new NotFoundException(`Patient avec CaryPass ID "${patientId}" non trouvé`);
      return patient.id;
    }
    // Otherwise try as UUID directly
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient non trouvé');
    return patient.id;
  }

  async create(dto: CreateHospitalisationDto, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const resolvedPatientId = await this.resolvePatientId(dto.patientId);

    // Auto-fill institutionId from doctor's institution if not provided
    let institutionId = dto.institutionId || null;
    if (!institutionId) {
      const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId }, select: { institutionId: true } });
      institutionId = doctor?.institutionId || null;
    }

    const hospitalisation = await this.prisma.hospitalisation.create({
      data: {
        patientId: resolvedPatientId,
        doctorId,
        institutionId,
        room: dto.room,
        bed: dto.bed,
        admissionDate: new Date(dto.admissionDate),
        reason: dto.reason,
        diagnosis: dto.diagnosis,
        notes: dto.notes,
      },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    // Create care plan items if provided — optimized to a single createMany (N+1 fix)
    if (dto.carePlanItems && dto.carePlanItems.length > 0) {
      await this.prisma.carePlanItem.createMany({
        data: dto.carePlanItems.map((item) => {
          const lower = item.task.toLowerCase();
          const isMedication = lower.includes('mg') || lower.includes('injection') || lower.includes('perfusion');
          const isVital = lower.includes('constante') || lower.includes('tension') || lower.includes('temperature') || lower.includes('pouls');
          return {
            hospitalisationId: hospitalisation.id,
            type: (isMedication ? 'medication' : isVital ? 'vital_check' : 'care_task') as any,
            title: item.task,
            frequency: item.frequency || 'Au besoin',
            description: `Priorité: ${item.priority || 'routine'}`,
          };
        }),
      });
    }

    // Assign nurses if provided — optimized to batch validation + batch upsert (N+1 fix)
    if (dto.nurseIds && dto.nurseIds.length > 0 && institutionId) {
      const patientName = `${hospitalisation.patient?.user?.firstName ?? ''} ${hospitalisation.patient?.user?.lastName ?? ''}`.trim();
      const doctorName = `${hospitalisation.doctor?.user?.firstName ?? ''} ${hospitalisation.doctor?.user?.lastName ?? ''}`.trim();
      const room = hospitalisation.room
        ? ` (chambre ${hospitalisation.room}${hospitalisation.bed ? ` - lit ${hospitalisation.bed}` : ''})`
        : '';

      // Fetch all valid nurses in one query instead of 1-per-nurse
      const validNurses = await this.prisma.nurse.findMany({
        where: { id: { in: dto.nurseIds }, institutionId },
        include: { user: { select: { id: true } } },
      });

      // Batch-create assignments (skipDuplicates replaces per-item upsert)
      if (validNurses.length > 0) {
        await this.prisma.hospitalisationNurseAssignment.createMany({
          data: validNurses.map((n) => ({
            hospitalisationId: hospitalisation.id,
            nurseId: n.id,
          })),
          skipDuplicates: true,
        });

        // Notify each nurse (notifications require per-user calls)
        await Promise.all(
          validNurses.map((nurse) =>
            nurse.user?.id
              ? this.notificationsService.create(
                  nurse.user.id,
                  {
                    type: 'info',
                    title: 'Nouvelle affectation',
                    message: `Vous avez été assigné(e) à l'hospitalisation de ${patientName}${room}. Médecin: Dr. ${doctorName}.`,
                    link: `/nurse/hospitalisations/${hospitalisation.id}`,
                  },
                ).catch(() => {})
              : Promise.resolve(),
          ),
        );
      }
    }

    return hospitalisation;
  }

  /**
   * Get nurses available for assignment (same institution as doctor).
   */
  async getAvailableNursesForDoctor(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { institutionId: true },
    });
    if (!doctor || !doctor.institutionId) {
      return [];
    }

    const nurses = await this.prisma.nurse.findMany({
      where: { institutionId: doctor.institutionId },
      include: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return nurses.map((n) => ({
      id: n.id,
      firstName: n.user.firstName,
      lastName: n.user.lastName,
      specialty: n.specialty,
      avatarUrl: n.user.avatarUrl,
    }));
  }

  async findAll(user: any) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prisma.hospitalisation.findMany({
      where: { doctorId },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1 },
        institution: { select: { name: true } },
      },
      orderBy: { admissionDate: 'desc' },
    });
  }

  /**
   * List hospitalisations for the connected patient.
   */
  async findMineForPatient(userId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException('Profil patient non trouvé');

    return this.prisma.hospitalisation.findMany({
      where: { patientId: patient.id },
      include: {
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        institution: { select: { name: true, city: true } },
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { admissionDate: 'desc' },
    });
  }

  /**
   * Detail of a single hospitalisation for the connected patient.
   * Verifies the hospitalisation actually belongs to this patient.
   */
  async findMineDetailForPatient(id: string, userId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException('Profil patient non trouvé');

    const hosp = await this.prisma.hospitalisation.findUnique({
      where: { id },
      include: {
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        institution: { select: { name: true, city: true, phone: true } },
        vitalSigns: { orderBy: { recordedAt: 'desc' } },
        medications: { orderBy: { administeredAt: 'desc' } },
        evolutionNotes: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.patientId !== patient.id) {
      throw new ForbiddenException('Accès non autorisé');
    }
    return hosp;
  }

  async findActive(user: any) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prisma.hospitalisation.findMany({
      where: { doctorId, status: 'en_cours' },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1 },
        institution: { select: { name: true } },
      },
      orderBy: { admissionDate: 'desc' },
    });
  }

  async findOne(id: string, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const hosp = await this.prisma.hospitalisation.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        institution: { select: { name: true } },
        vitalSigns: { orderBy: { recordedAt: 'desc' } },
        medications: { orderBy: { administeredAt: 'desc' } },
        evolutionNotes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.doctorId !== doctorId) throw new ForbiddenException('Accès non autorisé');
    return hosp;
  }

  async update(id: string, dto: UpdateHospitalisationDto, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const hosp = await this.prisma.hospitalisation.findUnique({ where: { id } });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.doctorId !== doctorId) throw new ForbiddenException('Accès non autorisé');

    return this.prisma.hospitalisation.update({
      where: { id },
      data: {
        ...(dto.room !== undefined && { room: dto.room }),
        ...(dto.bed !== undefined && { bed: dto.bed }),
        ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        ...(dto.dischargeDate !== undefined && { dischargeDate: new Date(dto.dischargeDate) }),
      },
    });
  }

  async discharge(id: string, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const hosp = await this.prisma.hospitalisation.findUnique({ where: { id } });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.doctorId !== doctorId) throw new ForbiddenException('Accès non autorisé');

    return this.prisma.hospitalisation.update({
      where: { id },
      data: { status: 'terminee', dischargeDate: new Date() },
    });
  }

  async addVital(hospitalisationId: string, dto: AddVitalDto, user: any) {
    await this.findOne(hospitalisationId, user); // verify access
    return this.prisma.hospitalisationVital.create({
      data: { hospitalisationId, ...dto },
    });
  }

  async addMedication(hospitalisationId: string, dto: AddMedicationDto, user: any) {
    await this.findOne(hospitalisationId, user);
    return this.prisma.hospitalisationMedication.create({
      data: {
        hospitalisationId,
        medication: dto.medication,
        dosage: dto.dosage,
        route: (dto.route as any) || 'PO',
        administeredBy: dto.administeredBy,
        notes: dto.notes,
      },
    });
  }

  async addEvolutionNote(hospitalisationId: string, dto: AddEvolutionNoteDto, user: any) {
    const hosp = await this.findOne(hospitalisationId, user);
    const doctorName = hosp.doctor?.user
      ? `Dr. ${hosp.doctor.user.firstName} ${hosp.doctor.user.lastName}`
      : 'Médecin';
    return this.prisma.evolutionNote.create({
      data: { hospitalisationId, doctorName, content: dto.content },
    });
  }

  async getStats(user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [active, todayAdmissions, allHosp] = await Promise.all([
      this.prisma.hospitalisation.count({ where: { doctorId, status: 'en_cours' } }),
      this.prisma.hospitalisation.count({
        where: { doctorId, admissionDate: { gte: today } },
      }),
      this.prisma.hospitalisation.findMany({
        where: { doctorId, status: 'terminee', dischargeDate: { not: null } },
        select: { admissionDate: true, dischargeDate: true },
      }),
    ]);

    const avgStayDays = allHosp.length > 0
      ? Math.round(
          allHosp.reduce((sum, h) => {
            const diff = (h.dischargeDate!.getTime() - h.admissionDate.getTime()) / 86400000;
            return sum + diff;
          }, 0) / allHosp.length,
        )
      : 0;

    return {
      activeCount: active,
      todayAdmissions,
      avgStayDays,
      totalCompleted: allHosp.length,
    };
  }

  // ─── Care Plan Items (Cahier de charges) ────────────────────────────────

  async addCarePlanItem(hospitalisationId: string, dto: CreateCarePlanItemDto, user: any) {
    await this.findOne(hospitalisationId, user); // verify doctor ownership
    const item = await this.prisma.carePlanItem.create({
      data: {
        hospitalisationId,
        type: dto.type as any,
        title: dto.title,
        description: dto.description,
        medication: dto.medication,
        dosage: dto.dosage,
        route: dto.route as any,
        frequency: dto.frequency,
        scheduledTimes: dto.scheduledTimes,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    // Notify all assigned nurses about the new task
    await this.notifyAssignedNurses(hospitalisationId, dto.title);

    return item;
  }

  async addCarePlanItems(hospitalisationId: string, items: CreateCarePlanItemDto[], user: any) {
    await this.findOne(hospitalisationId, user);
    // OPTIMIZED: batched per-item creates into a single $transaction round-trip (avoids N sequential await roundtrips)
    const created = await this.prisma.$transaction(
      items.map((dto) =>
        this.prisma.carePlanItem.create({
          data: {
            hospitalisationId,
            type: dto.type as any,
            title: dto.title,
            description: dto.description,
            medication: dto.medication,
            dosage: dto.dosage,
            route: dto.route as any,
            frequency: dto.frequency,
            scheduledTimes: dto.scheduledTimes,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          },
        }),
      ),
    );

    // Notify all assigned nurses once about the new tasks (single notification grouping all)
    if (items.length > 0) {
      const summary = items.length === 1
        ? items[0].title
        : `${items.length} nouvelles tâches ajoutées`;
      await this.notifyAssignedNurses(hospitalisationId, summary);
    }

    return created;
  }

  async getCarePlanItems(hospitalisationId: string, user: any) {
    await this.findOne(hospitalisationId, user);
    return this.prisma.carePlanItem.findMany({
      where: { hospitalisationId, isActive: true },
      include: {
        executions: {
          orderBy: { executedAt: 'desc' },
          include: {
            nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deactivateCarePlanItem(itemId: string, user: any) {
    const item = await this.prisma.carePlanItem.findUnique({
      where: { id: itemId },
      include: { hospitalisation: true },
    });
    if (!item) throw new NotFoundException('Tâche non trouvée');
    const doctorId = await this.getDoctorId(user.id);
    if (item.hospitalisation.doctorId !== doctorId) throw new ForbiddenException('Accès non autorisé');

    return this.prisma.carePlanItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
  }
}
