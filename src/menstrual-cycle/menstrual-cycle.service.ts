import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';

@Injectable()
export class MenstrualCycleService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // LOG A NEW CYCLE (period start)
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreateCycleDto) {
    const patient = await this.getPatient(userId);

    // Verify the patient is female
    if (patient.gender !== 'F') {
      throw new BadRequestException('Le suivi menstruel est réservé aux patientes');
    }

    const startDate = new Date(dto.startDate);
    const cycleLength = dto.cycleLength || 28;
    const periodLength = dto.periodLength || 5;

    // Calculate ovulation: typically 14 days before next period
    const ovulationDate = new Date(startDate);
    ovulationDate.setDate(ovulationDate.getDate() + (cycleLength - 14));

    // Fertile window: 5 days before ovulation to 1 day after
    const fertileWindowStart = new Date(ovulationDate);
    fertileWindowStart.setDate(fertileWindowStart.getDate() - 5);
    const fertileWindowEnd = new Date(ovulationDate);
    fertileWindowEnd.setDate(fertileWindowEnd.getDate() + 1);

    // Next period prediction
    const nextPeriodDate = new Date(startDate);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleLength);

    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;

    const cycle = await this.prisma.menstrualCycle.create({
      data: {
        patientId: patient.id,
        startDate,
        endDate,
        cycleLength,
        periodLength,
        flow: dto.flow,
        symptoms: dto.symptoms,
        notes: dto.notes,
        ovulationDate,
        fertileWindowStart,
        fertileWindowEnd,
        nextPeriodDate,
      },
    });

    return {
      success: true,
      data: cycle,
      predictions: {
        ovulationDate,
        fertileWindowStart,
        fertileWindowEnd,
        nextPeriodDate,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET ALL CYCLES FOR THE PATIENT
  // ---------------------------------------------------------------------------
  async findAll(userId: string, page: number = 1, limit: number = 12) {
    const patient = await this.getPatient(userId);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.menstrualCycle.findMany({
        where: { patientId: patient.id },
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.menstrualCycle.count({ where: { patientId: patient.id } }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---------------------------------------------------------------------------
  // GET ONE CYCLE
  // ---------------------------------------------------------------------------
  async findOne(userId: string, cycleId: string) {
    const patient = await this.getPatient(userId);

    const cycle = await this.prisma.menstrualCycle.findUnique({
      where: { id: cycleId },
    });

    if (!cycle || cycle.patientId !== patient.id) {
      throw new NotFoundException('Cycle non trouvé');
    }

    return { success: true, data: cycle };
  }

  // ---------------------------------------------------------------------------
  // UPDATE A CYCLE
  // ---------------------------------------------------------------------------
  async update(userId: string, cycleId: string, dto: UpdateCycleDto) {
    const patient = await this.getPatient(userId);

    const cycle = await this.prisma.menstrualCycle.findUnique({
      where: { id: cycleId },
    });

    if (!cycle || cycle.patientId !== patient.id) {
      throw new NotFoundException('Cycle non trouvé');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : cycle.startDate;
    const cycleLength = dto.cycleLength || cycle.cycleLength || 28;

    // Recalculate predictions if dates changed
    const ovulationDate = new Date(startDate);
    ovulationDate.setDate(ovulationDate.getDate() + (cycleLength - 14));

    const fertileWindowStart = new Date(ovulationDate);
    fertileWindowStart.setDate(fertileWindowStart.getDate() - 5);
    const fertileWindowEnd = new Date(ovulationDate);
    fertileWindowEnd.setDate(fertileWindowEnd.getDate() + 1);

    const nextPeriodDate = new Date(startDate);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleLength);

    const updated = await this.prisma.menstrualCycle.update({
      where: { id: cycleId },
      data: {
        ...(dto.startDate && { startDate }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.cycleLength !== undefined && { cycleLength }),
        ...(dto.periodLength !== undefined && { periodLength: dto.periodLength }),
        ...(dto.flow !== undefined && { flow: dto.flow }),
        ...(dto.symptoms !== undefined && { symptoms: dto.symptoms }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ovulationDate,
        fertileWindowStart,
        fertileWindowEnd,
        nextPeriodDate,
      },
    });

    return { success: true, data: updated };
  }

  // ---------------------------------------------------------------------------
  // DELETE A CYCLE
  // ---------------------------------------------------------------------------
  async remove(userId: string, cycleId: string) {
    const patient = await this.getPatient(userId);

    const cycle = await this.prisma.menstrualCycle.findUnique({
      where: { id: cycleId },
    });

    if (!cycle || cycle.patientId !== patient.id) {
      throw new NotFoundException('Cycle non trouvé');
    }

    await this.prisma.menstrualCycle.delete({ where: { id: cycleId } });

    return { success: true, message: 'Cycle supprimé' };
  }

  // ---------------------------------------------------------------------------
  // GET PREDICTIONS (latest cycle based)
  // ---------------------------------------------------------------------------
  async getPredictions(userId: string) {
    const patient = await this.getPatient(userId);

    if (patient.gender !== 'F') {
      throw new BadRequestException('Le suivi menstruel est réservé aux patientes');
    }

    // Get the last 6 cycles to calculate averages
    const recentCycles = await this.prisma.menstrualCycle.findMany({
      where: { patientId: patient.id },
      orderBy: { startDate: 'desc' },
      take: 6,
    });

    if (recentCycles.length === 0) {
      return {
        success: true,
        data: null,
        message: 'Aucun cycle enregistré. Commencez par enregistrer vos règles.',
      };
    }

    // Calculate average cycle length from history
    const cycleLengths = recentCycles
      .filter((c) => c.cycleLength)
      .map((c) => c.cycleLength!);
    const avgCycleLength = cycleLengths.length > 0
      ? Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length)
      : 28;

    const periodLengths = recentCycles
      .filter((c) => c.periodLength)
      .map((c) => c.periodLength!);
    const avgPeriodLength = periodLengths.length > 0
      ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
      : 5;

    const lastCycle = recentCycles[0];
    const lastStartDate = new Date(lastCycle.startDate);

    // Predictions based on average
    const nextPeriodDate = new Date(lastStartDate);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + avgCycleLength);

    const nextPeriodEndDate = new Date(nextPeriodDate);
    nextPeriodEndDate.setDate(nextPeriodEndDate.getDate() + avgPeriodLength);

    const ovulationDate = new Date(nextPeriodDate);
    ovulationDate.setDate(ovulationDate.getDate() - 14);

    // Is she currently on her period?
    const today = new Date();
    const lastEndDate = lastCycle.endDate || new Date(lastStartDate.getTime() + avgPeriodLength * 86400000);
    const isOnPeriod = today >= lastStartDate && today <= lastEndDate;

    // Days until next period
    const daysUntilNextPeriod = Math.ceil((nextPeriodDate.getTime() - today.getTime()) / 86400000);

    // Current cycle day
    const currentCycleDay = Math.ceil((today.getTime() - lastStartDate.getTime()) / 86400000) + 1;

    // Fertile window for next cycle
    const fertileWindowStart = new Date(ovulationDate);
    fertileWindowStart.setDate(fertileWindowStart.getDate() - 5);
    const fertileWindowEnd = new Date(ovulationDate);
    fertileWindowEnd.setDate(fertileWindowEnd.getDate() + 1);

    // Is she currently in fertile window?
    const currentOvulation = new Date(lastStartDate);
    currentOvulation.setDate(currentOvulation.getDate() + (avgCycleLength - 14));
    const currentFertileStart = new Date(currentOvulation);
    currentFertileStart.setDate(currentFertileStart.getDate() - 5);
    const currentFertileEnd = new Date(currentOvulation);
    currentFertileEnd.setDate(currentFertileEnd.getDate() + 1);
    const isFertile = today >= currentFertileStart && today <= currentFertileEnd;

    return {
      success: true,
      data: {
        averageCycleLength: avgCycleLength,
        averagePeriodLength: avgPeriodLength,
        currentCycleDay: currentCycleDay > 0 ? currentCycleDay : null,
        isOnPeriod,
        isFertile,
        daysUntilNextPeriod: daysUntilNextPeriod > 0 ? daysUntilNextPeriod : 0,
        nextPeriodDate,
        nextPeriodEndDate,
        ovulationDate,
        fertileWindowStart,
        fertileWindowEnd,
        lastPeriodStart: lastStartDate,
        totalCyclesRecorded: recentCycles.length,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // HELPER
  // ---------------------------------------------------------------------------
  private async getPatient(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new ForbiddenException('Seuls les patients peuvent accéder au suivi menstruel');
    }

    return patient;
  }
}
