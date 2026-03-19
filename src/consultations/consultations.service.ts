import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ConsultationFilterDto } from './dto/consultation-filter.dto';

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List consultations with role-based filtering and pagination.
   */
  async findAll(filters: ConsultationFilterDto, user: any) {
    const { page = 1, limit = 20, search, patientId, doctorId, status, type, dateFrom, dateTo } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ConsultationWhereInput = {};

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
    if (status) {
      where.status = status;
    }
    if (type) {
      where.type = type;
    }

    // Date range filters
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        (where.date as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      }
      if (dateTo) {
        (where.date as Prisma.DateTimeFilter).lte = new Date(dateTo);
      }
    }

    // Search by motif or diagnosis
    if (search) {
      where.OR = [
        { motif: { contains: search, mode: 'insensitive' } },
        { diagnosis: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.consultation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
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
      this.prisma.consultation.count({ where }),
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
   * Get a consultation by ID with related data.
   */
  async findOne(id: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
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
        prescriptions: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation non trouvee');
    }

    return { success: true, data: consultation };
  }

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
   * Create a new consultation.
   * Only doctors can create consultations.
   */
  async create(doctorId: string, dto: CreateConsultationDto) {
    // Verify doctor profile exists
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }

    // Resolve patient ID (supports CarePass ID like CP-2025-00001)
    const resolvedPatientId = await this.resolvePatientId(dto.patientId);
    dto.patientId = resolvedPatientId;

    // Check doctor has access to this patient (via AccessGrant)
    const accessGrant = await this.prisma.accessGrant.findFirst({
      where: {
        doctorId,
        patientId: resolvedPatientId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
    });

    if (!accessGrant) {
      throw new ForbiddenException('Acces refuse : vous n\'avez pas l\'autorisation d\'acceder a ce patient');
    }

    const consultation = await this.prisma.$transaction(async (tx) => {
      // Create the consultation
      const consult = await tx.consultation.create({
        data: {
          patientId: dto.patientId,
          doctorId,
          date: new Date(dto.date),
          type: dto.type,
          motif: dto.motif,
          symptoms: dto.symptoms,
          diagnosis: dto.diagnosis,
          notes: dto.notes,
          severity: dto.severity,
          vitalSigns: dto.vitalSigns ? (dto.vitalSigns as any) : undefined,
          status: dto.status,
        },
      });

      // Create prescription with items if provided
      if (dto.prescriptions && dto.prescriptions.length > 0) {
        const prescription = await tx.prescription.create({
          data: {
            consultationId: consult.id,
            patientId: dto.patientId,
            doctorId,
          },
        });

        await tx.prescriptionItem.createMany({
          data: dto.prescriptions.map((item) => ({
            prescriptionId: prescription.id,
            medication: item.medication,
            dosage: item.dosage || null,
            frequency: item.frequency || null,
            duration: item.duration || null,
            instructions: item.notes || null,
          })),
        });
      }

      // Return full consultation with relations
      return tx.consultation.findUnique({
        where: { id: consult.id },
        include: {
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
          prescriptions: {
            include: { items: true },
          },
        },
      });
    });

    return { success: true, data: consultation };
  }

  /**
   * Update a consultation record.
   * Only the creating doctor can update.
   */
  async update(id: string, doctorId: string, dto: UpdateConsultationDto) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });

    if (!consultation) {
      throw new NotFoundException('Consultation non trouvee');
    }

    if (consultation.doctorId !== doctorId) {
      throw new ForbiddenException('Acces refuse : seul le medecin createur peut modifier cette consultation');
    }

    const updateData: any = {};
    if (dto.date !== undefined) updateData.date = new Date(dto.date);
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.motif !== undefined) updateData.motif = dto.motif;
    if (dto.symptoms !== undefined) updateData.symptoms = dto.symptoms;
    if (dto.diagnosis !== undefined) updateData.diagnosis = dto.diagnosis;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.severity !== undefined) updateData.severity = dto.severity;
    if (dto.vitalSigns !== undefined) updateData.vitalSigns = dto.vitalSigns as any;
    if (dto.status !== undefined) updateData.status = dto.status;

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: updateData,
      include: {
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
   * Delete a consultation record.
   * Only the creating doctor can delete.
   */
  async remove(id: string, doctorId: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });

    if (!consultation) {
      throw new NotFoundException('Consultation non trouvee');
    }

    if (consultation.doctorId !== doctorId) {
      throw new ForbiddenException('Acces refuse : seul le medecin createur peut supprimer cette consultation');
    }

    await this.prisma.consultation.delete({ where: { id } });

    return { success: true, data: null, message: 'Consultation supprimee avec succes' };
  }

  /**
   * Get prescription(s) linked to a consultation.
   */
  async getPrescription(id: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });

    if (!consultation) {
      throw new NotFoundException('Consultation non trouvee');
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where: { consultationId: id },
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
    });

    return { success: true, data: prescriptions };
  }

  /**
   * Generate a PDF report for a consultation.
   * Stub: returns consultation data as JSON with a note.
   */
  async generatePdf(id: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true },
            },
          },
        },
        prescriptions: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation non trouvee');
    }

    return {
      success: true,
      data: consultation,
      message: 'PDF generation a implementer — donnees de la consultation retournees en JSON',
    };
  }
}
