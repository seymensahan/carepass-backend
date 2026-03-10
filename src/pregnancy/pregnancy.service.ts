import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreatePregnancyDto } from './dto/create-pregnancy.dto';
import { UpdatePregnancyDto } from './dto/update-pregnancy.dto';
import { CreatePregnancyAppointmentDto } from './dto/create-pregnancy-appointment.dto';

@Injectable()
export class PregnancyService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // CREATE PREGNANCY (after positive test)
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreatePregnancyDto) {
    const patient = await this.getPatient(userId);

    if (patient.gender !== 'F') {
      throw new BadRequestException('Le suivi de grossesse est réservé aux patientes');
    }

    // Check for existing active pregnancy
    const existing = await this.prisma.pregnancy.findFirst({
      where: { patientId: patient.id, status: 'en_cours' },
    });
    if (existing) {
      throw new BadRequestException('Une grossesse en cours existe déjà');
    }

    const startDate = new Date(dto.startDate);

    // Calculate expected due date (40 weeks / 280 days from last period)
    let expectedDueDate: Date;
    if (dto.expectedDueDate) {
      expectedDueDate = new Date(dto.expectedDueDate);
    } else {
      expectedDueDate = new Date(startDate);
      expectedDueDate.setDate(expectedDueDate.getDate() + 280);
    }

    // Calculate current weeks
    const today = new Date();
    const weeksCurrent = Math.floor((today.getTime() - startDate.getTime()) / (7 * 86400000));

    const pregnancy = await this.prisma.pregnancy.create({
      data: {
        patientId: patient.id,
        startDate,
        expectedDueDate,
        weeksCurrent: weeksCurrent > 0 ? weeksCurrent : 0,
        notes: dto.notes,
      },
      include: { appointments: true },
    });

    // Auto-create standard pregnancy appointments
    await this.createStandardAppointments(pregnancy.id, startDate);

    // Fetch with appointments
    const result = await this.prisma.pregnancy.findUnique({
      where: { id: pregnancy.id },
      include: { appointments: { orderBy: { date: 'asc' } } },
    });

    return { success: true, data: result };
  }

  // ---------------------------------------------------------------------------
  // GET ACTIVE PREGNANCY
  // ---------------------------------------------------------------------------
  async getActive(userId: string) {
    const patient = await this.getPatient(userId);

    const pregnancy = await this.prisma.pregnancy.findFirst({
      where: { patientId: patient.id, status: 'en_cours' },
      include: {
        appointments: { orderBy: { date: 'asc' } },
      },
    });

    if (!pregnancy) {
      return { success: true, data: null, message: 'Aucune grossesse en cours' };
    }

    // Update current weeks
    const weeksCurrent = Math.floor(
      (new Date().getTime() - pregnancy.startDate.getTime()) / (7 * 86400000),
    );

    if (weeksCurrent !== pregnancy.weeksCurrent) {
      await this.prisma.pregnancy.update({
        where: { id: pregnancy.id },
        data: { weeksCurrent },
      });
      pregnancy.weeksCurrent = weeksCurrent;
    }

    // Calculate trimester
    let trimester = 1;
    if (weeksCurrent >= 28) trimester = 3;
    else if (weeksCurrent >= 14) trimester = 2;

    // Days until due date
    const daysUntilDue = Math.ceil(
      (pregnancy.expectedDueDate.getTime() - new Date().getTime()) / 86400000,
    );

    // Progress percentage
    const progressPercent = Math.min(Math.round((weeksCurrent / 40) * 100), 100);

    return {
      success: true,
      data: {
        ...pregnancy,
        trimester,
        daysUntilDue: daysUntilDue > 0 ? daysUntilDue : 0,
        progressPercent,
        weeklyInfo: this.getWeeklyInfo(weeksCurrent),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET ALL PREGNANCIES (history)
  // ---------------------------------------------------------------------------
  async findAll(userId: string) {
    const patient = await this.getPatient(userId);

    const pregnancies = await this.prisma.pregnancy.findMany({
      where: { patientId: patient.id },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { appointments: true } } },
    });

    return { success: true, data: pregnancies };
  }

  // ---------------------------------------------------------------------------
  // GET ONE PREGNANCY
  // ---------------------------------------------------------------------------
  async findOne(userId: string, pregnancyId: string) {
    const patient = await this.getPatient(userId);

    const pregnancy = await this.prisma.pregnancy.findUnique({
      where: { id: pregnancyId },
      include: { appointments: { orderBy: { date: 'asc' } } },
    });

    if (!pregnancy || pregnancy.patientId !== patient.id) {
      throw new NotFoundException('Grossesse non trouvée');
    }

    return { success: true, data: pregnancy };
  }

  // ---------------------------------------------------------------------------
  // UPDATE PREGNANCY
  // ---------------------------------------------------------------------------
  async update(userId: string, pregnancyId: string, dto: UpdatePregnancyDto) {
    const patient = await this.getPatient(userId);

    const pregnancy = await this.prisma.pregnancy.findUnique({
      where: { id: pregnancyId },
    });

    if (!pregnancy || pregnancy.patientId !== patient.id) {
      throw new NotFoundException('Grossesse non trouvée');
    }

    const updated = await this.prisma.pregnancy.update({
      where: { id: pregnancyId },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.expectedDueDate && { expectedDueDate: new Date(dto.expectedDueDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.complications !== undefined && { complications: dto.complications }),
      },
      include: { appointments: { orderBy: { date: 'asc' } } },
    });

    return { success: true, data: updated };
  }

  // ---------------------------------------------------------------------------
  // ADD APPOINTMENT TO PREGNANCY
  // ---------------------------------------------------------------------------
  async addAppointment(userId: string, pregnancyId: string, dto: CreatePregnancyAppointmentDto) {
    const patient = await this.getPatient(userId);

    const pregnancy = await this.prisma.pregnancy.findUnique({
      where: { id: pregnancyId },
    });

    if (!pregnancy || pregnancy.patientId !== patient.id) {
      throw new NotFoundException('Grossesse non trouvée');
    }

    const appointment = await this.prisma.pregnancyAppointment.create({
      data: {
        pregnancyId,
        title: dto.title,
        date: new Date(dto.date),
        type: dto.type,
        notes: dto.notes,
      },
    });

    return { success: true, data: appointment };
  }

  // ---------------------------------------------------------------------------
  // MARK APPOINTMENT AS COMPLETED
  // ---------------------------------------------------------------------------
  async completeAppointment(userId: string, appointmentId: string, results?: any) {
    const patient = await this.getPatient(userId);

    const appointment = await this.prisma.pregnancyAppointment.findUnique({
      where: { id: appointmentId },
      include: { pregnancy: true },
    });

    if (!appointment || appointment.pregnancy.patientId !== patient.id) {
      throw new NotFoundException('Rendez-vous non trouvé');
    }

    const updated = await this.prisma.pregnancyAppointment.update({
      where: { id: appointmentId },
      data: {
        completed: true,
        ...(results !== undefined && { results }),
      },
    });

    return { success: true, data: updated };
  }

  // ---------------------------------------------------------------------------
  // LOG WEIGHT / BLOOD PRESSURE
  // ---------------------------------------------------------------------------
  async logVitals(userId: string, pregnancyId: string, data: { weight?: number; systolic?: number; diastolic?: number }) {
    const patient = await this.getPatient(userId);

    const pregnancy = await this.prisma.pregnancy.findUnique({
      where: { id: pregnancyId },
    });

    if (!pregnancy || pregnancy.patientId !== patient.id) {
      throw new NotFoundException('Grossesse non trouvée');
    }

    const today = new Date().toISOString().split('T')[0];

    // Append to weight log
    if (data.weight !== undefined) {
      const weightLog = (pregnancy.weightLog as any[]) || [];
      weightLog.push({ date: today, weight: data.weight });
      await this.prisma.pregnancy.update({
        where: { id: pregnancyId },
        data: { weightLog },
      });
    }

    // Append to blood pressure log
    if (data.systolic !== undefined && data.diastolic !== undefined) {
      const bpLog = (pregnancy.bloodPressureLog as any[]) || [];
      bpLog.push({ date: today, systolic: data.systolic, diastolic: data.diastolic });
      await this.prisma.pregnancy.update({
        where: { id: pregnancyId },
        data: { bloodPressureLog: bpLog },
      });
    }

    const updated = await this.prisma.pregnancy.findUnique({
      where: { id: pregnancyId },
    });

    return { success: true, data: updated };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------
  private async getPatient(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new ForbiddenException('Seuls les patients peuvent accéder au suivi de grossesse');
    }

    return patient;
  }

  private async createStandardAppointments(pregnancyId: string, startDate: Date) {
    const appointments = [
      { title: 'Première consultation prénatale', weekOffset: 8, type: 'consultation' },
      { title: 'Échographie T1 (datation)', weekOffset: 12, type: 'echographie' },
      { title: 'Dépistage trisomie 21', weekOffset: 12, type: 'analyse' },
      { title: 'Consultation 2ème mois', weekOffset: 16, type: 'consultation' },
      { title: 'Échographie T2 (morphologie)', weekOffset: 22, type: 'echographie' },
      { title: 'Test de glucose', weekOffset: 26, type: 'analyse' },
      { title: 'Consultation 7ème mois', weekOffset: 28, type: 'consultation' },
      { title: 'Échographie T3 (croissance)', weekOffset: 32, type: 'echographie' },
      { title: 'Consultation 8ème mois', weekOffset: 34, type: 'consultation' },
      { title: 'Consultation 9ème mois', weekOffset: 37, type: 'consultation' },
      { title: 'Monitoring pré-accouchement', weekOffset: 39, type: 'consultation' },
    ];

    const data = appointments.map((apt) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + apt.weekOffset * 7);
      return {
        pregnancyId,
        title: apt.title,
        date,
        type: apt.type,
      };
    });

    await this.prisma.pregnancyAppointment.createMany({ data });
  }

  private getWeeklyInfo(week: number): { size: string; development: string } {
    const info: Record<number, { size: string; development: string }> = {
      4: { size: 'Graine de pavot', development: 'Le cœur commence à battre' },
      8: { size: 'Framboise', development: 'Les doigts et orteils se forment' },
      12: { size: 'Citron vert', development: 'Les organes sont formés' },
      16: { size: 'Avocat', development: 'Bébé peut bouger et sucer son pouce' },
      20: { size: 'Banane', development: 'Vous pouvez sentir les mouvements' },
      24: { size: 'Épi de maïs', development: 'Les poumons se développent' },
      28: { size: 'Aubergine', development: 'Bébé peut ouvrir les yeux' },
      32: { size: 'Noix de coco', development: 'Les os se durcissent' },
      36: { size: 'Melon', development: 'Bébé se prépare pour la naissance' },
      40: { size: 'Pastèque', development: 'Prêt à naître !' },
    };

    // Find closest week info
    const weeks = Object.keys(info).map(Number).sort((a, b) => a - b);
    let closest = weeks[0];
    for (const w of weeks) {
      if (w <= week) closest = w;
    }

    return info[closest] || { size: 'En développement', development: 'Votre bébé grandit' };
  }
}
