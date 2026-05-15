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
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Find every user that belongs to a lab institution (admin + any doctor/nurse linked there).
   * Used to push real-time `lab-order:new` events to labs after order creation.
   * If `labInstitutionId` is null, returns admin user IDs of every lab institution
   * (marketplace mode → broadcast to every lab in the system).
   */
  private async resolveLabUserIds(labInstitutionId: string | null): Promise<string[]> {
    const where: Prisma.InstitutionWhereInput = labInstitutionId
      ? { id: labInstitutionId, type: 'laboratory' }
      : { type: 'laboratory' };

    const institutions = await this.prisma.institution.findMany({
      where,
      select: {
        adminUserId: true,
        doctors: { select: { userId: true } },
        nurses: { select: { userId: true } },
      },
    });

    const userIds = new Set<string>();
    for (const inst of institutions) {
      if (inst.adminUserId) userIds.add(inst.adminUserId);
      for (const d of inst.doctors) userIds.add(d.userId);
      for (const n of inst.nurses) userIds.add(n.userId);
    }
    return [...userIds];
  }

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
      // Include consultations of dependents (managed + read-only after transfer)
      const guardianships = await this.prisma.legalGuardian.findMany({
        where: { guardianPatientId: patient.id },
        select: { dependentId: true, canManage: true, readOnlyAfterTransfer: true },
      });
      const dependentIds = guardianships
        .filter((g) => g.canManage || g.readOnlyAfterTransfer)
        .map((g) => g.dependentId);
      where.patientId = { in: [patient.id, ...dependentIds] };
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
        initiatedByNurse: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        prescriptions: {
          include: {
            items: true,
            doctor: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
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
      const patient = await this.prisma.patient.findUnique({ where: { carypassId: patientId } });
      if (!patient) throw new NotFoundException(`Patient avec CaryPass ID "${patientId}" non trouvé`);
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

    // Resolve patient ID (supports CaryPass ID like CP-2025-00001)
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

      // Create lab orders if labOrders array provided (one per requested exam).
      // The optional labInstitutionId routes the orders to a specific lab.
      // Without it, orders are visible to all labs (marketplace mode).
      if (dto.labOrders && dto.labOrders.length > 0) {
        const orders = dto.labOrders
          .map((examType) => examType?.trim())
          .filter((examType): examType is string => !!examType);

        if (orders.length > 0) {
          await tx.labOrder.createMany({
            data: orders.map((examType) => ({
              patientId: dto.patientId,
              doctorId,
              consultationId: consult.id,
              examType,
              status: 'pending' as const,
              labInstitutionId: dto.labInstitutionId || null,
            })),
          });
        }
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

    // Create notification for patient (with real-time WebSocket delivery)
    if (consultation?.patient?.user?.id) {
      const docName = `${consultation.doctor?.user?.firstName ?? ''} ${consultation.doctor?.user?.lastName ?? ''}`.trim();
      await this.notificationsService.create(
        consultation.patient.user.id,
        {
          type: 'info',
          title: 'Nouvelle consultation',
          message: `Dr. ${docName} a ajouté une consultation à votre dossier`,
          link: '/consultations/' + consultation.id,
        },
      ).catch(() => {});
    }

    // Push real-time `lab-order:new` event to the targeted lab(s) so their
    // dashboard refreshes without polling. Fire-and-forget: any failure here
    // must not break consultation creation (the orders are already in DB).
    if (dto.labOrders && dto.labOrders.length > 0) {
      this.resolveLabUserIds(dto.labInstitutionId || null)
        .then((userIds) => {
          this.eventsGateway.emitToUsers(userIds, 'lab-order:new', {
            consultationId: consultation?.id,
            patientId: dto.patientId,
            examTypes: dto.labOrders,
            labInstitutionId: dto.labInstitutionId || null,
          });
        })
        .catch(() => {});
    }

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

  // =========================================================================
  // NURSE — Initiate consultation with vital signs
  // =========================================================================

  private async getNurseId(userId: string): Promise<string> {
    const nurse = await this.prisma.nurse.findUnique({ where: { userId } });
    if (!nurse) throw new NotFoundException('Profil infirmier non trouvé');
    return nurse.id;
  }

  /**
   * Nurse initiates a consultation by recording vital signs.
   * The consultation is created WITHOUT a doctor — it will be assigned via transfer.
   */
  async nurseInitiate(userId: string, dto: {
    patientId: string;
    motif: string;
    temperature?: number;
    heartRate?: number;
    bloodPressure?: string;
    weight?: number;
    height?: number;
    oxygenSaturation?: number;
    respiratoryRate?: number;
    vitalNotes?: string;
  }) {
    const nurseId = await this.getNurseId(userId);

    // Resolve patient ID (supports CaryPass ID)
    const resolvedPatientId = await this.resolvePatientId(dto.patientId);

    // Build vital signs JSON
    const vitalSigns: any = {};
    if (dto.temperature !== undefined) vitalSigns.temperature = dto.temperature;
    if (dto.heartRate !== undefined) vitalSigns.heartRate = dto.heartRate;
    if (dto.bloodPressure) vitalSigns.bloodPressure = dto.bloodPressure;
    if (dto.weight !== undefined) vitalSigns.weight = dto.weight;
    if (dto.height !== undefined) vitalSigns.height = dto.height;
    if (dto.oxygenSaturation !== undefined) vitalSigns.oxygenSaturation = dto.oxygenSaturation;
    if (dto.respiratoryRate !== undefined) vitalSigns.respiratoryRate = dto.respiratoryRate;
    if (dto.vitalNotes) vitalSigns.notes = dto.vitalNotes;

    const consultation = await this.prisma.consultation.create({
      data: {
        patientId: resolvedPatientId,
        date: new Date(),
        type: 'consultation',
        motif: dto.motif,
        vitalSigns: Object.keys(vitalSigns).length > 0 ? vitalSigns : undefined,
        status: 'en_cours',
        initiatedByNurseId: nurseId,
      },
      include: {
        patient: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        initiatedByNurse: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    // Notify the patient
    if (consultation.patient?.user?.id) {
      const nurseName = consultation.initiatedByNurse?.user
        ? `${consultation.initiatedByNurse.user.firstName} ${consultation.initiatedByNurse.user.lastName}`
        : 'Une infirmière';
      await this.notificationsService.create(
        consultation.patient.user.id,
        {
          type: 'info',
          title: 'Paramètres vitaux enregistrés',
          message: `${nurseName} a enregistré vos paramètres vitaux`,
          link: '/consultations/' + consultation.id,
        },
      ).catch(() => {});
    }

    return { success: true, data: consultation };
  }

  // =========================================================================
  // NURSE — Transfer consultation to a doctor
  // =========================================================================

  async nurseTransfer(userId: string, consultationId: string, dto: {
    doctorId?: string;
    externalDoctorName?: string;
    externalDoctorSpecialty?: string;
    externalDoctorPhone?: string;
  }) {
    const nurseId = await this.getNurseId(userId);

    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation non trouvée');

    // Must have been initiated by a nurse and not yet transferred
    if (consultation.transferredAt) {
      throw new BadRequestException('Cette consultation a déjà été transférée');
    }

    const updateData: any = {
      transferredByNurseId: nurseId,
      transferredAt: new Date(),
    };

    if (dto.doctorId) {
      // Internal doctor — verify exists
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: dto.doctorId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!doctor) throw new NotFoundException('Docteur non trouvé');

      updateData.doctorId = dto.doctorId;

      // Notify the doctor
      const patientName = `${consultation.patient?.user?.firstName ?? ''} ${consultation.patient?.user?.lastName ?? ''}`.trim();
      await this.notificationsService.create(
        doctor.user!.id,
        {
          type: 'info',
          title: 'Patient transféré',
          message: `L'infirmier(e) vous a transféré le dossier de ${patientName}. Paramètres vitaux déjà enregistrés.`,
          link: '/consultations/' + consultation.id,
        },
      ).catch(() => {});
    } else if (dto.externalDoctorName) {
      // External doctor
      updateData.externalDoctorName = dto.externalDoctorName;
      updateData.externalDoctorSpecialty = dto.externalDoctorSpecialty;
      updateData.externalDoctorPhone = dto.externalDoctorPhone;
    } else {
      throw new BadRequestException('Veuillez spécifier un docteur CaryPass ou un docteur externe');
    }

    const updated = await this.prisma.consultation.update({
      where: { id: consultationId },
      data: updateData,
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        initiatedByNurse: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    return { success: true, data: updated };
  }

  // =========================================================================
  // Available doctors for transfer (in the nurse's institution)
  // =========================================================================

  async getAvailableDoctors(userId: string) {
    const nurse = await this.prisma.nurse.findUnique({ where: { userId } });
    if (!nurse) throw new NotFoundException('Profil infirmier non trouvé');

    // Get ALL doctors in the system — prioritize same institution, then others
    const doctors = await this.prisma.doctor.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            isActive: true,
          },
        },
        institution: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter out inactive users
    const active = doctors.filter((d) => d.user.isActive !== false);

    // Sort: same institution first, then others
    const sorted = active.sort((a, b) => {
      const aInst = a.institutionId === nurse.institutionId ? 0 : 1;
      const bInst = b.institutionId === nurse.institutionId ? 0 : 1;
      return aInst - bInst;
    });

    return sorted.map((d) => ({
      id: d.id,
      firstName: d.user.firstName,
      lastName: d.user.lastName,
      specialty: d.specialty,
      avatarUrl: d.user.avatarUrl,
      institution: d.institution?.name || null,
      sameInstitution: d.institutionId === nurse.institutionId,
    }));
  }

  // =========================================================================
  // Nurse — list consultations initiated by this nurse
  // =========================================================================

  async findNurseConsultations(userId: string) {
    const nurseId = await this.getNurseId(userId);

    return this.prisma.consultation.findMany({
      where: { initiatedByNurseId: nurseId },
      include: {
        patient: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { date: 'desc' },
      take: 50,
    });
  }
}
