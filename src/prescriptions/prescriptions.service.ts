import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { PrescriptionFilterDto } from './dto/prescription-filter.dto';

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List prescriptions with pagination and role-based filtering.
   */
  async findAll(filters: PrescriptionFilterDto, user: any) {
    const { page = 1, limit = 20, patientId, doctorId, consultationId, status } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.PrescriptionWhereInput = {};

    // Role-based filtering
    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }
      where.doctorId = doctor.id;
    } else if (user.role === 'patient') {
      const patient = await this.prisma.patient.findUnique({ where: { userId: user.id } });
      if (!patient) {
        throw new NotFoundException('Profil patient non trouve');
      }
      where.patientId = patient.id;
    }
    // super_admin and institution_admin can see all (with optional filters)

    // Apply optional filters
    if (patientId) {
      where.patientId = patientId;
    }
    if (doctorId) {
      where.doctorId = doctorId;
    }
    if (consultationId) {
      where.consultationId = consultationId;
    }
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          patient: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
          doctor: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
              },
            },
          },
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a prescription by ID with related data.
   */
  async findOne(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        consultation: true,
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription non trouvee');
    }

    return { success: true, data: prescription };
  }

  /**
   * Create a new prescription with nested items.
   * Only doctors can create prescriptions.
   */
  async create(doctorId: string, dto: CreatePrescriptionDto) {
    // Verify doctor profile exists
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }

    // Verify consultation exists
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: dto.consultationId },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation non trouvee');
    }

    // Verify patient exists
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) {
      throw new NotFoundException('Patient non trouve');
    }

    const prescription = await this.prisma.prescription.create({
      data: {
        consultationId: dto.consultationId,
        patientId: dto.patientId,
        doctorId,
        notes: dto.notes,
        items: {
          create: dto.items.map((item) => ({
            medication: item.medication,
            dosage: item.dosage,
            frequency: item.frequency,
            duration: item.duration,
            instructions: item.instructions,
          })),
        },
      },
      include: {
        items: true,
        consultation: true,
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
      },
    });

    return { success: true, data: prescription };
  }

  /**
   * Update a prescription record.
   * If items are provided, deletes existing items and creates new ones (transaction).
   * Only the creating doctor can update.
   */
  async update(id: string, doctorId: string, dto: UpdatePrescriptionDto) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id } });

    if (!prescription) {
      throw new NotFoundException('Prescription non trouvee');
    }

    if (prescription.doctorId !== doctorId) {
      throw new ForbiddenException('Acces refuse : seul le medecin createur peut modifier cette prescription');
    }

    // Use a transaction if items need to be replaced
    if (dto.items && dto.items.length > 0) {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.prescriptionItem.deleteMany({
          where: { prescriptionId: id },
        });

        // Update prescription and create new items
        return tx.prescription.update({
          where: { id },
          data: {
            notes: dto.notes !== undefined ? dto.notes : undefined,
            status: dto.status !== undefined ? dto.status : undefined,
            items: {
              create: dto.items!.map((item) => ({
                medication: item.medication,
                dosage: item.dosage,
                frequency: item.frequency,
                duration: item.duration,
                instructions: item.instructions,
              })),
            },
          },
          include: {
            items: true,
            consultation: true,
            patient: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
                },
              },
            },
            doctor: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
                },
              },
            },
          },
        });
      });

      return { success: true, data: updated };
    }

    // Update without touching items
    const updateData: any = {};
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.status !== undefined) updateData.status = dto.status;

    const updated = await this.prisma.prescription.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        consultation: true,
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            },
          },
        },
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Delete a prescription record.
   * Only the creating doctor can delete.
   */
  async remove(id: string, doctorId: string) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id } });

    if (!prescription) {
      throw new NotFoundException('Prescription non trouvee');
    }

    if (prescription.doctorId !== doctorId) {
      throw new ForbiddenException('Acces refuse : seul le medecin createur peut supprimer cette prescription');
    }

    await this.prisma.prescription.delete({ where: { id } });

    return { success: true, data: null, message: 'Prescription supprimee avec succes' };
  }
}
