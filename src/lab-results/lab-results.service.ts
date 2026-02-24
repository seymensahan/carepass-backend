import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateLabResultDto } from './dto/create-lab-result.dto';
import { UpdateLabResultDto } from './dto/update-lab-result.dto';
import { LabResultFilterDto } from './dto/lab-result-filter.dto';

@Injectable()
export class LabResultsService {
  constructor(private readonly prisma: PrismaClient) {}

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
        where.patientId = patientProfile.id;
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
      },
    });

    if (!labResult) {
      throw new NotFoundException('Resultat de laboratoire non trouve');
    }

    return labResult;
  }

  async create(uploadedById: string, dto: CreateLabResultDto) {
    const { items, ...data } = dto;

    const labResult = await this.prisma.labResult.create({
      data: {
        ...data,
        date: new Date(data.date),
        uploadedById,
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
    const existing = await this.prisma.labResult.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (!existing) {
      throw new NotFoundException('Resultat de laboratoire non trouve');
    }

    const labResult = await this.prisma.labResult.update({
      where: { id },
      data: { status: 'validated' },
      include: {
        items: true,
        patient: { include: { user: true } },
        uploadedBy: true,
      },
    });

    // Create notification for the patient
    if (existing.patient) {
      await this.prisma.notification.create({
        data: {
          userId: existing.patient.userId,
          title: 'Resultat valide',
          message: `Votre resultat "${existing.title}" a ete valide par un medecin.`,
          type: 'info',
        },
      });
    }

    return labResult;
  }
}
