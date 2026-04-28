import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LabOrdersService {
  private readonly logger = new Logger(LabOrdersService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // LIST orders (filtered by user role)
  // ───────────────────────────────────────────────────────────────────────
  async findAll(user: any, filters: { status?: string; page?: number; limit?: number }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (user.role === 'lab') {
      // Resolve the lab user's institution. A lab user is the admin of an
      // Institution where type='laboratory'.
      const labInstitution = await this.prisma.institution.findFirst({
        where: { adminUserId: user.id, type: 'laboratory' },
        select: { id: true },
      });

      // Visibility rules for a lab account:
      //   1. Pending orders targeted at MY institution (private routing)
      //   2. Pending orders with no target (marketplace mode — any lab)
      //   3. Orders I have already picked up (regardless of target / status)
      const orConditions: any[] = [
        { status: 'pending', labInstitutionId: null },
        { pickedUpById: user.id },
      ];
      if (labInstitution) {
        orConditions.push({
          status: 'pending',
          labInstitutionId: labInstitution.id,
        });
      }
      where.OR = orConditions;
    } else if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
      if (!doctor) throw new NotFoundException('Profil médecin non trouvé');
      where.doctorId = doctor.id;
    } else if (user.role === 'patient') {
      const patient = await this.prisma.patient.findUnique({ where: { userId: user.id } });
      if (!patient) throw new NotFoundException('Profil patient non trouvé');
      where.patientId = patient.id;
    } else if (user.role !== 'super_admin') {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const [data, total] = await Promise.all([
      this.prisma.labOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }],
        include: {
          patient: {
            include: {
              user: {
                select: { firstName: true, lastName: true, phone: true, avatarUrl: true },
              },
            },
          },
          doctor: {
            include: {
              user: {
                select: { firstName: true, lastName: true, phone: true },
              },
              institution: { select: { name: true } },
            },
          },
          consultation: { select: { id: true, motif: true, date: true } },
          labInstitution: { select: { id: true, name: true } },
          result: { select: { id: true, fileUrl: true, status: true } },
        },
      }),
      this.prisma.labOrder.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // GET one order
  // ───────────────────────────────────────────────────────────────────────
  async findOne(id: string, user: any) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            user: {
              select: {
                firstName: true, lastName: true, phone: true, email: true, avatarUrl: true,
              },
            },
          },
        },
        doctor: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, phone: true } },
            institution: { select: { name: true } },
          },
        },
        consultation: { select: { id: true, motif: true, diagnosis: true, date: true } },
        labInstitution: { select: { id: true, name: true } },
        result: true,
      },
    });

    if (!order) throw new NotFoundException('Ordre de laboratoire non trouvé');
    return order;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PICK UP order (lab claims it)
  // ───────────────────────────────────────────────────────────────────────
  async pickUp(id: string, userId: string) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id },
      include: {
        doctor: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Ordre non trouvé');
    if (order.status !== 'pending') {
      throw new BadRequestException('Cet ordre a déjà été pris en charge');
    }

    const updated = await this.prisma.labOrder.update({
      where: { id },
      data: {
        status: 'in_progress',
        pickedUpById: userId,
        pickedUpAt: new Date(),
      },
    });

    // Notify the prescribing doctor
    if (order.doctor.user?.id) {
      const patientName = `${order.patient.user.firstName} ${order.patient.user.lastName}`;
      this.notificationsService.create(
        order.doctor.user.id,
        {
          type: 'info',
          title: 'Analyse prise en charge',
          message: `Le laboratoire a pris en charge l'analyse "${order.examType}" pour ${patientName}`,
          link: `/doctor/consultation/${order.consultationId}`,
        },
      ).catch(() => {});
    }

    return updated;
  }

  // ───────────────────────────────────────────────────────────────────────
  // CANCEL order (doctor only)
  // ───────────────────────────────────────────────────────────────────────
  async cancel(id: string, userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new ForbiddenException('Profil médecin requis');

    const order = await this.prisma.labOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Ordre non trouvé');
    if (order.doctorId !== doctor.id) {
      throw new ForbiddenException('Vous n\'êtes pas le prescripteur de cet ordre');
    }

    return this.prisma.labOrder.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // STATS for lab dashboard
  // ───────────────────────────────────────────────────────────────────────
  async getLabStats(userId: string) {
    // Match the visibility rules of `findAll`: only count pending orders the
    // lab can actually see (its institution's targeted + marketplace nulls).
    const labInstitution = await this.prisma.institution.findFirst({
      where: { adminUserId: userId, type: 'laboratory' },
      select: { id: true },
    });

    const visibleInstitutionIds: (string | null)[] = labInstitution
      ? [labInstitution.id, null]
      : [null];

    const pendingWhere = {
      status: 'pending' as const,
      labInstitutionId: { in: visibleInstitutionIds as any },
    };

    const [pending, inProgress, completed, urgent] = await Promise.all([
      this.prisma.labOrder.count({ where: pendingWhere }),
      this.prisma.labOrder.count({ where: { pickedUpById: userId, status: 'in_progress' } }),
      this.prisma.labOrder.count({ where: { pickedUpById: userId, status: 'completed' } }),
      this.prisma.labOrder.count({ where: { ...pendingWhere, urgent: true } }),
    ]);

    return { pending, inProgress, completed, urgent };
  }
}
