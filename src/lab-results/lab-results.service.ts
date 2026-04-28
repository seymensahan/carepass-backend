import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateLabResultDto } from './dto/create-lab-result.dto';
import { UpdateLabResultDto } from './dto/update-lab-result.dto';
import { LabResultFilterDto } from './dto/lab-result-filter.dto';
import { EmailService } from '../email/email.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LabResultsService {
  private readonly logger = new Logger(LabResultsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
    private readonly storageService: CloudinaryService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(filters: LabResultFilterDto, user: any) {
    const { page = 1, limit = 20, patientId, category, status, dateFrom, dateTo } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Role-based filtering
    if (user.role === 'lab') {
      where.uploadedById = user.id;
    } else if (user.role === 'doctor') {
      const doctorProfile = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (doctorProfile) {
        const grants = await this.prisma.accessGrant.findMany({
          where: {
            doctorId: doctorProfile.id,
            isActive: true,
          },
          select: { patientId: true },
        });
        const patientIds = grants.map((g) => g.patientId);
        where.patientId = { in: patientIds };
      }
    } else if (user.role === 'patient') {
      const patientProfile = await this.prisma.patient.findUnique({
        where: { userId: user.id },
      });
      if (patientProfile) {
        // Include dependents
        const guardianships = await this.prisma.legalGuardian.findMany({
          where: { guardianPatientId: patientProfile.id },
          select: { dependentId: true, canManage: true, readOnlyAfterTransfer: true },
        });
        const dependentIds = guardianships
          .filter((g) => g.canManage || g.readOnlyAfterTransfer)
          .map((g) => g.dependentId);
        where.patientId = { in: [patientProfile.id, ...dependentIds] };
      }
    } else if (user.role !== 'super_admin') {
      where.patientId = '__none__';
    }

    if (patientId) {
      where.patientId = patientId;
    }
    if (category) {
      where.category = category;
    }
    if (status) {
      where.status = status;
    }
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.labResult.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          items: true,
          patient: { include: { user: true } },
          uploadedBy: true,
          institution: { select: { name: true, type: true } },
          diagnosedBy: { include: { user: { select: { firstName: true, lastName: true } } } },
          labOrder: {
            include: {
              doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.labResult.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const labResult = await this.prisma.labResult.findUnique({
      where: { id },
      include: {
        items: true,
        patient: { include: { user: true } },
        uploadedBy: true,
        institution: true,
        diagnosedBy: { include: { user: { select: { firstName: true, lastName: true } } } },
        labOrder: {
          include: {
            doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
        consultation: {
          select: {
            id: true,
            date: true,
            motif: true,
            diagnosis: true,
            doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    if (!labResult) {
      throw new NotFoundException('Resultat de laboratoire non trouve');
    }

    return labResult;
  }

  async create(uploadedById: string, dto: CreateLabResultDto, file?: Express.Multer.File) {
    const { items, ...data } = dto;

    this.logger.log(
      `Creating lab result — patientId=${data.patientId}, labOrderId=${(data as any).labOrderId || 'none'}, hasFile=${!!file}`,
    );

    // Upload file to Appwrite if provided, otherwise use fileUrl from DTO
    let resolvedFileUrl = data.fileUrl || '';
    let fileSize: number | undefined;
    let mimeType: string | undefined;
    if (file) {
      const { url } = await this.storageService.uploadFile(file, 'lab-results');
      resolvedFileUrl = url;
      fileSize = file.size;
      mimeType = file.mimetype;
    }

    // If a labOrderId is provided, validate and use its data to fill missing fields
    const labOrderId = (data as any).labOrderId as string | undefined;
    let labOrder: any = null;
    if (labOrderId) {
      labOrder = await this.prisma.labOrder.findUnique({
        where: { id: labOrderId },
        include: {
          doctor: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      });
      if (!labOrder) {
        throw new NotFoundException('Ordre de laboratoire non trouvé');
      }
      if (labOrder.status === 'completed') {
        throw new ForbiddenException('Cet ordre a déjà été complété');
      }
    }

    const labResult = await this.prisma.labResult.create({
      data: {
        patientId: data.patientId,
        title: data.title,
        category: data.category,
        date: new Date(data.date),
        fileUrl: resolvedFileUrl,
        fileSize,
        mimeType,
        uploadedById,
        institutionId: data.institutionId,
        consultationId: (data as any).consultationId || labOrder?.consultationId || undefined,
        labOrderId: labOrderId || undefined,
        notes: data.notes,
        items: items && items.length > 0
          ? {
              create: items.map((item) => ({
                name: item.name,
                value: item.value,
                unit: item.unit,
                referenceRange: item.referenceRange,
                isAbnormal: item.isAbnormal ?? false,
              })),
            }
          : undefined,
      },
      include: {
        items: true,
        patient: { include: { user: true } },
        uploadedBy: true,
      },
    });

    // Mark lab order as completed if linked
    if (labOrderId) {
      try {
        await this.prisma.labOrder.update({
          where: { id: labOrderId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            pickedUpById: labOrder?.pickedUpById || uploadedById,
            pickedUpAt: labOrder?.pickedUpAt || new Date(),
          },
        });
        this.logger.log(`LabOrder ${labOrderId} marked as completed`);
      } catch (err) {
        this.logger.error(
          `Failed to mark LabOrder ${labOrderId} as completed`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    const patientUser = (labResult as any).patient?.user;
    const patientName = patientUser
      ? `${patientUser.firstName} ${patientUser.lastName}`
      : 'votre patient';

    // Send email to patient (non-blocking)
    if (patientUser?.email) {
      this.emailService.sendLabResultReadyEmail(
        patientUser.email,
        patientUser.firstName,
        labResult.title,
      ).catch(() => {});
    }

    // In-app notification for the patient
    if (patientUser?.id) {
      this.notificationsService.create(
        patientUser.id,
        {
          type: 'success',
          title: 'Résultat d\'analyse disponible',
          message: `Votre résultat "${labResult.title}" est maintenant disponible`,
          link: `/records/lab-results/${labResult.id}`,
        },
      ).catch(() => {});
    }

    // In-app notification for the prescribing doctor (via labOrder OR via consultation)
    let doctorUserId: string | undefined;
    if (labOrder?.doctor?.user?.id) {
      doctorUserId = labOrder.doctor.user.id;
    } else if (labResult.consultationId) {
      const consultation = await this.prisma.consultation.findUnique({
        where: { id: labResult.consultationId },
        include: { doctor: { include: { user: { select: { id: true } } } } },
      });
      doctorUserId = consultation?.doctor?.user?.id;
    }

    if (doctorUserId) {
      this.notificationsService.create(
        doctorUserId,
        {
          type: 'info',
          title: 'Résultat d\'analyse reçu',
          message: `Le résultat "${labResult.title}" pour ${patientName} a été uploadé par le laboratoire`,
          // Send the doctor straight to the lab result so they can write
          // their diagnosis. The page itself shows context + a link back to
          // the consultation when needed.
          link: `/records/lab-results/${labResult.id}`,
        },
      ).catch(() => {});
    }

    return labResult;
  }

  async update(id: string, userId: string, dto: UpdateLabResultDto) {
    const existing = await this.prisma.labResult.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Resultat de laboratoire non trouve');
    }

    const { items, ...data } = dto;

    if (data.date) {
      (data as any).date = new Date(data.date);
    }

    if (items !== undefined) {
      // Use transaction to replace items
      const labResult = await this.prisma.$transaction(async (tx) => {
        await tx.labResultItem.deleteMany({
          where: { labResultId: id },
        });

        return tx.labResult.update({
          where: { id },
          data: {
            ...data,
            items: items.length > 0
              ? {
                  create: items.map((item) => ({
                    name: item.name,
                    value: item.value,
                    unit: item.unit,
                    referenceRange: item.referenceRange,
                    isAbnormal: item.isAbnormal ?? false,
                  })),
                }
              : undefined,
          },
          include: {
            items: true,
            patient: { include: { user: true } },
            uploadedBy: true,
          },
        });
      });

      return labResult;
    }

    return this.prisma.labResult.update({
      where: { id },
      data,
      include: {
        items: true,
        patient: { include: { user: true } },
        uploadedBy: true,
      },
    });
  }

  async remove(id: string, userId: string, userRole: string) {
    const existing = await this.prisma.labResult.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Resultat de laboratoire non trouve');
    }

    if (existing.uploadedById !== userId && userRole !== 'super_admin') {
      throw new ForbiddenException(
        "Vous n'avez pas la permission de supprimer ce resultat",
      );
    }

    await this.prisma.labResult.delete({ where: { id } });

    return { message: 'Resultat de laboratoire supprime avec succes' };
  }

  async validate(id: string, doctorUserId: string) {
    return this.diagnose(id, doctorUserId, undefined);
  }

  /**
   * Doctor provides their diagnosis on a lab result.
   * - Sets status to 'validated'
   * - Records diagnosis text + diagnosing doctor + timestamp
   * - Notifies the patient with the diagnosis available
   */
  async diagnose(id: string, doctorUserId: string, diagnosis?: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
    });
    if (!doctor) {
      throw new ForbiddenException('Profil médecin requis');
    }

    const existing = await this.prisma.labResult.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (!existing) {
      throw new NotFoundException('Resultat de laboratoire non trouve');
    }

    const labResult = await this.prisma.labResult.update({
      where: { id },
      data: {
        status: 'validated',
        doctorDiagnosis: diagnosis ?? existing.doctorDiagnosis,
        diagnosedAt: new Date(),
        diagnosedById: doctor.id,
      },
      include: {
        items: true,
        patient: { include: { user: true } },
        uploadedBy: true,
        diagnosedBy: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    // Notify the patient
    if (existing.patient) {
      const doctorUser = await this.prisma.user.findUnique({ where: { id: doctorUserId } });
      const doctorName = doctorUser
        ? `Dr. ${doctorUser.firstName} ${doctorUser.lastName}`
        : 'Votre médecin';
      await this.notificationsService.create(
        existing.patient.userId,
        {
          title: 'Diagnostic disponible',
          message: `${doctorName} a analysé votre résultat "${existing.title}"${diagnosis ? '. Cliquez pour voir le diagnostic.' : ''}`,
          type: 'success',
          link: `/records/lab-results/${id}`,
        },
      ).catch(() => {});
    }

    return labResult;
  }
}
