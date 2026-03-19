import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient, AppointmentStatus } from '@prisma/client';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AppointmentFilterDto } from './dto/appointment-filter.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Valid status transitions for appointments.
   */
  private readonly validTransitions: Record<string, string[]> = {
    scheduled: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
  };

  /**
   * Resolve a patient identifier (CarePass ID like CP-2025-00001 or UUID) to a UUID.
   */
  private async resolvePatientId(patientId: string): Promise<string> {
    if (patientId.startsWith('CP-')) {
      const patient = await this.prisma.patient.findUnique({ where: { carepassId: patientId } });
      if (!patient) throw new NotFoundException(`Patient avec CarePass ID "${patientId}" non trouvé`);
      return patient.id;
    }
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient non trouvé');
    return patient.id;
  }

  /**
   * List appointments with role-based filtering and pagination.
   */
  async findAll(filters: AppointmentFilterDto, user: any) {
    const { page = 1, limit = 20, status, dateFrom, dateTo, patientId, doctorId } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Role-based filtering
    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil médecin non trouvé');
      }
      where.doctorId = doctor.id;
    } else if (user.role === 'patient') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: user.id },
      });
      if (!patient) {
        throw new NotFoundException('Profil patient non trouvé');
      }
      where.patientId = patient.id;
    }
    // Admin and super_admin see all — no additional filter

    // Optional filters
    if (status) {
      where.status = status;
    }
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }
    if (patientId) {
      where.patientId = patientId;
    }
    if (doctorId) {
      where.doctorId = doctorId;
    }

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          patient: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          },
          doctor: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single appointment by ID with relations.
   */
  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        doctor: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous non trouvé');
    }

    return appointment;
  }

  /**
   * Create a new appointment.
   * If role=doctor: doctorId from user's doctor profile, patientId from DTO.
   * If role=patient: patientId from user's patient profile, doctorId from DTO.
   */
  async create(userId: string, role: string, dto: CreateAppointmentDto) {
    let patientId: string;
    let doctorId: string;

    if (role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId },
      });
      if (!doctor) {
        throw new NotFoundException('Profil médecin non trouvé');
      }
      doctorId = doctor.id;

      if (!dto.patientId) {
        throw new BadRequestException('L\'identifiant du patient est requis');
      }

      // Resolve CarePass ID (CP-2025-XXXXX) or UUID to actual patient UUID
      patientId = await this.resolvePatientId(dto.patientId);
    } else if (role === 'patient') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
      });
      if (!patient) {
        throw new NotFoundException('Profil patient non trouvé');
      }
      patientId = patient.id;

      if (!dto.doctorId) {
        throw new BadRequestException('L\'identifiant du médecin est requis');
      }
      doctorId = dto.doctorId;

      // Verify doctor exists
      const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
      if (!doctor) {
        throw new NotFoundException('Médecin non trouvé');
      }
    } else {
      // Admin creating — both IDs required
      if (!dto.patientId || !dto.doctorId) {
        throw new BadRequestException('Les identifiants du patient et du médecin sont requis');
      }
      patientId = dto.patientId;
      doctorId = dto.doctorId;
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        date: new Date(dto.date),
        duration: dto.duration ?? 30,
        type: dto.type,
        reason: dto.reason,
        notes: dto.notes,
        status: AppointmentStatus.scheduled,
      },
      include: {
        patient: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        doctor: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    return appointment;
  }

  /**
   * Update appointment fields.
   */
  async update(id: string, userId: string, dto: UpdateAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous non trouvé');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        patient: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        doctor: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    return updated;
  }

  /**
   * Update appointment status with transition validation.
   * Creates a notification for the other party.
   */
  async updateStatus(id: string, userId: string, dto: UpdateStatusDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        doctor: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous non trouvé');
    }

    // Validate status transition
    const currentStatus = appointment.status;
    const newStatus = dto.status;
    const allowedTransitions = this.validTransitions[currentStatus];

    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Transition de statut invalide : ${currentStatus} vers ${newStatus}`,
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: newStatus as AppointmentStatus },
      include: {
        patient: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        doctor: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    // Create notification for the other party
    const isUserDoctor = appointment.doctor.user.id === userId;
    const notifyUserId = isUserDoctor
      ? appointment.patient.user.id
      : appointment.doctor.user.id;

    const statusLabels: Record<string, string> = {
      confirmed: 'confirmé',
      cancelled: 'annulé',
      completed: 'terminé',
    };

    const statusLabel = statusLabels[newStatus] || newStatus;

    await this.prisma.notification.create({
      data: {
        userId: notifyUserId,
        title: 'Mise à jour de rendez-vous',
        message: `Votre rendez-vous a été ${statusLabel}.`,
        type: newStatus === 'cancelled' ? 'warning' : 'info',
        link: `/appointments/${id}`,
      },
    });

    return updated;
  }

  /**
   * Delete an appointment.
   */
  async remove(id: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous non trouvé');
    }

    await this.prisma.appointment.delete({
      where: { id },
    });

    return { message: 'Rendez-vous supprimé avec succès' };
  }
}
