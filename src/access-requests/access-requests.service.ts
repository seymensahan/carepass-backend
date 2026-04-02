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

@Injectable()
export class AccessRequestsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
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
        patient: { include: { user: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Demande d\'accès non trouvée');
    }

    return request;
  }

  /**
   * Create a new access request from a doctor to a patient.
   * Looks up the patient by their CaryPass ID.
   */
  async create(doctorUserId: string, dto: CreateAccessRequestDto) {
    // Find doctor profile from user ID
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
    });
    if (!doctor) {
      throw new NotFoundException('Profil médecin non trouvé');
    }

    // Find patient by CaryPass ID
    const patient = await this.prisma.patient.findUnique({
      where: { carypassId: dto.patientCarypassId },
    });
    if (!patient) {
      throw new NotFoundException('Patient non trouvé avec cet identifiant CaryPass');
    }

    // Check no pending request already exists for this doctor + patient
    const existingPending = await this.prisma.accessRequest.findFirst({
      where: {
        doctorId: doctor.id,
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
        doctorId: doctor.id,
        patientId: patient.id,
        patientCarypassId: dto.patientCarypassId,
        reason: dto.reason,
      },
      include: {
        doctor: { include: { user: true, institution: true } },
        patient: { include: { user: true } },
      },
    });

    // Send email to the patient about the access request (non-blocking)
    if (accessRequest.patient?.user?.email) {
      const doctorName = `${accessRequest.doctor?.user?.firstName ?? ''} ${accessRequest.doctor?.user?.lastName ?? ''}`.trim();
      this.emailService.sendAccessRequestEmail(
        accessRequest.patient.user.email,
        accessRequest.patient.user.firstName,
        doctorName,
        dto.reason || '',
      ).catch(() => {});
    }

    return accessRequest;
  }

  /**
   * Approve an access request (patient action).
   * - Verifies the request belongs to the patient
   * - Updates status to approved
   * - Auto-creates an AccessGrant
   * - Creates a notification for the doctor
   */
  async approve(id: string, patientUserId: string) {
    const request = await this.prisma.accessRequest.findUnique({
      where: { id },
      include: {
        patient: { include: { user: true } },
        doctor: true,
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

      // Auto-create AccessGrant
      this.prisma.accessGrant.create({
        data: {
          patientId: request.patientId,
          doctorId: request.doctorId,
        },
      }),

      // Notify the doctor
      this.prisma.notification.create({
        data: {
          userId: request.doctor.userId,
          title: 'Accès approuvé',
          message: `${patientName} a approuvé votre demande d'accès`,
          type: 'success',
        },
      }),
    ]);

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

      // Notify the doctor
      this.prisma.notification.create({
        data: {
          userId: request.doctor.userId,
          title: 'Accès refusé',
          message: `${patientName} a refusé votre demande d'accès`,
          type: 'warning',
        },
      }),
    ]);

    return updatedRequest;
  }
}
