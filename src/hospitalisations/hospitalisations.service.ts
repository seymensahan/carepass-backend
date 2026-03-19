import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateHospitalisationDto } from './dto/create-hospitalisation.dto';
import { UpdateHospitalisationDto } from './dto/update-hospitalisation.dto';
import { AddVitalDto } from './dto/add-vital.dto';
import { AddMedicationDto } from './dto/add-medication.dto';
import { AddEvolutionNoteDto } from './dto/add-evolution-note.dto';

@Injectable()
export class HospitalisationsService {
  constructor(private readonly prisma: PrismaClient) {}

  private async getDoctorId(userId: string): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new NotFoundException('Profil médecin non trouvé');
    return doctor.id;
  }

  private async resolvePatientId(patientId: string): Promise<string> {
    // If it looks like a CarePass ID (e.g. CP-2025-00001), resolve to UUID
    if (patientId.startsWith('CP-')) {
      const patient = await this.prisma.patient.findUnique({ where: { carepassId: patientId } });
      if (!patient) throw new NotFoundException(`Patient avec CarePass ID "${patientId}" non trouvé`);
      return patient.id;
    }
    // Otherwise try as UUID directly
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient non trouvé');
    return patient.id;
  }

  async create(dto: CreateHospitalisationDto, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const resolvedPatientId = await this.resolvePatientId(dto.patientId);
    return this.prisma.hospitalisation.create({
      data: {
        patientId: resolvedPatientId,
        doctorId,
        institutionId: dto.institutionId,
        room: dto.room,
        bed: dto.bed,
        admissionDate: new Date(dto.admissionDate),
        reason: dto.reason,
        diagnosis: dto.diagnosis,
        notes: dto.notes,
      },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async findAll(user: any) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prisma.hospitalisation.findMany({
      where: { doctorId },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1 },
        institution: { select: { name: true } },
      },
      orderBy: { admissionDate: 'desc' },
    });
  }

  async findActive(user: any) {
    const doctorId = await this.getDoctorId(user.id);
    return this.prisma.hospitalisation.findMany({
      where: { doctorId, status: 'en_cours' },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1 },
        institution: { select: { name: true } },
      },
      orderBy: { admissionDate: 'desc' },
    });
  }

  async findOne(id: string, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const hosp = await this.prisma.hospitalisation.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        institution: { select: { name: true } },
        vitalSigns: { orderBy: { recordedAt: 'desc' } },
        medications: { orderBy: { administeredAt: 'desc' } },
        evolutionNotes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.doctorId !== doctorId) throw new ForbiddenException('Accès non autorisé');
    return hosp;
  }

  async update(id: string, dto: UpdateHospitalisationDto, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const hosp = await this.prisma.hospitalisation.findUnique({ where: { id } });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.doctorId !== doctorId) throw new ForbiddenException('Accès non autorisé');

    return this.prisma.hospitalisation.update({
      where: { id },
      data: {
        ...(dto.room !== undefined && { room: dto.room }),
        ...(dto.bed !== undefined && { bed: dto.bed }),
        ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        ...(dto.dischargeDate !== undefined && { dischargeDate: new Date(dto.dischargeDate) }),
      },
    });
  }

  async discharge(id: string, user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const hosp = await this.prisma.hospitalisation.findUnique({ where: { id } });
    if (!hosp) throw new NotFoundException('Hospitalisation non trouvée');
    if (hosp.doctorId !== doctorId) throw new ForbiddenException('Accès non autorisé');

    return this.prisma.hospitalisation.update({
      where: { id },
      data: { status: 'terminee', dischargeDate: new Date() },
    });
  }

  async addVital(hospitalisationId: string, dto: AddVitalDto, user: any) {
    await this.findOne(hospitalisationId, user); // verify access
    return this.prisma.hospitalisationVital.create({
      data: { hospitalisationId, ...dto },
    });
  }

  async addMedication(hospitalisationId: string, dto: AddMedicationDto, user: any) {
    await this.findOne(hospitalisationId, user);
    return this.prisma.hospitalisationMedication.create({
      data: {
        hospitalisationId,
        medication: dto.medication,
        dosage: dto.dosage,
        route: (dto.route as any) || 'PO',
        administeredBy: dto.administeredBy,
        notes: dto.notes,
      },
    });
  }

  async addEvolutionNote(hospitalisationId: string, dto: AddEvolutionNoteDto, user: any) {
    const hosp = await this.findOne(hospitalisationId, user);
    const doctorName = hosp.doctor?.user
      ? `Dr. ${hosp.doctor.user.firstName} ${hosp.doctor.user.lastName}`
      : 'Médecin';
    return this.prisma.evolutionNote.create({
      data: { hospitalisationId, doctorName, content: dto.content },
    });
  }

  async getStats(user: any) {
    const doctorId = await this.getDoctorId(user.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [active, todayAdmissions, allHosp] = await Promise.all([
      this.prisma.hospitalisation.count({ where: { doctorId, status: 'en_cours' } }),
      this.prisma.hospitalisation.count({
        where: { doctorId, admissionDate: { gte: today } },
      }),
      this.prisma.hospitalisation.findMany({
        where: { doctorId, status: 'terminee', dischargeDate: { not: null } },
        select: { admissionDate: true, dischargeDate: true },
      }),
    ]);

    const avgStayDays = allHosp.length > 0
      ? Math.round(
          allHosp.reduce((sum, h) => {
            const diff = (h.dischargeDate!.getTime() - h.admissionDate.getTime()) / 86400000;
            return sum + diff;
          }, 0) / allHosp.length,
        )
      : 0;

    return {
      activeCount: active,
      todayAdmissions,
      avgStayDays,
      totalCompleted: allHosp.length,
    };
  }
}
