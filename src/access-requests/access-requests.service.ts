import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';
import { AccessRequestFilterDto } from './dto/access-request-filter.dto';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AccessRequestsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * List access requests with pagination.
   * Doctors see their outgoing requests; patients see their incoming requests.
   */
  async findAll(userId: string, role: string, filters: AccessRequestFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId },
      });
      if (!doctor) {
        throw new NotFoundException('Profil médecin non trouvé');
      }
      where.doctorId = doctor.id;
    } else if (role === 'patient') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
      });
      if (!patient) {
        throw new NotFoundException('Profil patient non trouvé');
      }
      where.patientId = patient.id;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.accessRequest.findMany({
        where,
        include: {
          doctor: { include: { user: true, institution: true } },
          patient: { include: { user: true } },
        },
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.accessRequest.count({ where }),
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
   * Get a single access request by ID.
   */
  async findOne(id: string) {
    const request = await this.prisma.accessRequest.findUnique({
      where: { id },
      include: {
        doctor: { include: { user: true, institution: true } },
        nurse: { include: { user: true } },
        patient: { include: { user: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Demande d\'accès non trouvée');
    }

    return request;
  }

  /**
   * Create a new access request from a doctor or nurse to a patient.
   * Looks up the patient by their CaryPass ID.
   */
  async create(userId: string, dto: CreateAccessRequestDto) {
    // Determine if requester is a doctor or nurse
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    let doctorId: string | null = null;
    let nurseId: string | null = null;
    let requesterName = '';

    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!doctor) throw new NotFoundException('Profil médecin non trouvé');
      doctorId = doctor.id;
      requesterName = `Dr. ${user.firstName} ${user.lastName}`;
    } else if (user.role === 'nurse') {
      const nurse = await this.prisma.nurse.findUnique({ where: { userId } });
      if (!nurse) throw new NotFoundException('Profil infirmier non trouvé');
      nurseId = nurse.id;
      requesterName = `Inf. ${user.firstName} ${user.lastName}`;
    } else {
      throw new ForbiddenException('Seuls les médecins et infirmiers peuvent demander l\'accès');
    }

    // Find patient by CaryPass ID
    const patient = await this.prisma.patient.findUnique({
      where: { carypassId: dto.patientCarypassId },
    });
    if (!patient) {
      throw new NotFoundException('Patient non trouvé avec cet identifiant CaryPass');
    }

    // Check no pending request already exists
    const existingPending = await this.prisma.accessRequest.findFirst({
      where: {
        ...(doctorId ? { doctorId } : { nurseId }),
        patientId: patient.id,
        status: 'pending',
      },
    });
    if (existingPending) {
      throw new ConflictException(
        'Une demande d\'accès en attente existe déjà pour ce patient',
      );
    }

    const accessRequest = await this.prisma.accessRequest.create({
      data: {
        doctorId,
        nurseId,
        patientId: patient.id,
        patientCarypassId: dto.patientCarypassId,
        reason: dto.reason,
      },
      include: {
        doctor: { include: { user: true, institution: true } },
        nurse: { include: { user: true } },
        patient: { include: { user: true } },
      },
    });

    // Send email (non-blocking)
    if (accessRequest.patient?.user?.email) {
      this.emailService.sendAccessRequestEmail(
        accessRequest.patient.user.email,
        accessRequest.patient.user.firstName,
        requesterName,
        dto.reason || '',
      ).catch(() => {});
    }

    // In-app notification for the patient
    if (accessRequest.patient?.user?.id) {
      await this.notificationsService.create(
        accessRequest.patient.user.id,
        {
          type: 'info',
          title: 'Demande d\'accès',
          message: `${requesterName} demande l'accès à votre dossier médical`,
          link: '/access-requests/' + accessRequest.id,
        },
      ).catch(() => {});
    }

    return accessRequest;
  }

  /**
   * Approve an access request (patient action).
   * - Verifies the request belongs to the patient
   * - Updates status to approved
   * - Auto-creates an AccessGrant with the duration chosen by the patient
   * - Creates a notification for the doctor
   */
  async approve(
    id: string,
    patientUserId: string,
    duration?: string,
    _permissions?: Record<string, boolean>,
  ) {
    const request = await this.prisma.accessRequest.findUnique({
      where: { id },
      include: {
        patient: { include: { user: true } },
        doctor: true,
        nurse: { include: { user: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Demande d\'accès non trouvée');
    }

    // Verify the request belongs to this patient
    if (request.patient.userId !== patientUserId) {
      throw new ForbiddenException('Cette demande ne vous appartient pas');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }

    const patientName = `${request.patient.user.firstName} ${request.patient.user.lastName}`;

    // Resolve expiresAt from patient's chosen duration.
    // Default to 1 week if no duration provided (safer than permanent).
    const durationToExpires = (d?: string): Date | null => {
      if (!d || d === 'permanent') return null;
      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();
      switch (d) {
        case '24h': return new Date(now + day);
        case '1_semaine': return new Date(now + 7 * day);
        case '1_mois': return new Date(now + 30 * day);
        case '3_mois': return new Date(now + 90 * day);
        default: return new Date(now + 7 * day);
      }
    };
    const grantExpiresAt = durationToExpires(duration);

    // Perform all writes in a transaction
    const [updatedRequest] = await this.prisma.$transaction([
      // Update the request status
      this.prisma.accessRequest.update({
        where: { id },
        data: {
          status: 'approved',
          respondedAt: new Date(),
        },
        include: {
          doctor: { include: { user: true, institution: true } },
          patient: { include: { user: true } },
        },
      }),

      // Auto-create AccessGrant (only for doctors)
      ...(request.doctorId ? [
        this.prisma.accessGrant.create({
          data: {
            patientId: request.patientId,
            doctorId: request.doctorId,
            expiresAt: grantExpiresAt,
          },
        }),
      ] : []),
    ]);

    // Notify the requester (doctor or nurse)
    const requesterUserId = request.doctor?.userId ?? request.nurse?.userId;
    if (requesterUserId) {
      await this.notificationsService.create(
        requesterUserId,
        {
          title: 'Accès approuvé',
          message: `${patientName} a approuvé votre demande d'accès`,
          type: 'success',
        },
      ).catch(() => {});
    }

    // Send email to the doctor about the granted access (non-blocking)
    if (updatedRequest.doctor?.user?.email) {
      this.emailService.sendAccessGrantedEmail(
        updatedRequest.doctor.user.email,
        updatedRequest.doctor.user.firstName,
        patientName,
        '',
      ).catch(() => {});
    }

    return updatedRequest;
  }

  /**
   * Deny an access request (patient action).
   * - Verifies the request belongs to the patient
   * - Updates status to denied
   * - Creates a notification for the doctor
   */
  async deny(id: string, patientUserId: string) {
    const request = await this.prisma.accessRequest.findUnique({
      where: { id },
      include: {
        patient: { include: { user: true } },
        doctor: true,
        nurse: { include: { user: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Demande d\'accès non trouvée');
    }

    // Verify the request belongs to this patient
    if (request.patient.userId !== patientUserId) {
      throw new ForbiddenException('Cette demande ne vous appartient pas');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }

    const patientName = `${request.patient.user.firstName} ${request.patient.user.lastName}`;

    const [updatedRequest] = await this.prisma.$transaction([
      // Update the request status
      this.prisma.accessRequest.update({
        where: { id },
        data: {
          status: 'denied',
          respondedAt: new Date(),
        },
        include: {
          doctor: { include: { user: true, institution: true } },
          patient: { include: { user: true } },
        },
      }),
    ]);

    // Notify the requester (doctor or nurse)
    const requesterUserId = request.doctor?.userId ?? request.nurse?.userId;
    if (requesterUserId) {
      await this.notificationsService.create(
        requesterUserId,
        {
          title: 'Accès refusé',
          message: `${patientName} a refusé votre demande d'accès`,
          type: 'warning',
        },
      ).catch(() => {});
    }

    return updatedRequest;
  }
}
