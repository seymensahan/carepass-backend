import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto';
import { VaccinationFilterDto } from './dto/vaccination-filter.dto';

@Injectable()
export class VaccinationsService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(filters: VaccinationFilterDto, user: any) {
    const { page = 1, limit = 20, patientId, childId, status } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Role-based filtering
    if (user.role === 'patient') {
      const patientProfile = await this.prisma.patient.findUnique({
        where: { userId: user.id },
        include: { children: true },
      });
      if (patientProfile) {
        const childIds = patientProfile.children.map((c) => c.id);
        where.OR = [
          { patientId: patientProfile.id },
          { childId: { in: childIds } },
        ];
      }
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
    } else if (user.role !== 'super_admin') {
      where.patientId = '__none__';
    }

    if (patientId) {
      where.patientId = patientId;
    }
    if (childId) {
      where.childId = childId;
    }
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.vaccination.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          patient: { include: { user: true } },
          child: true,
        },
      }),
      this.prisma.vaccination.count({ where }),
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
    const vaccination = await this.prisma.vaccination.findUnique({
      where: { id },
      include: {
        patient: { include: { user: true } },
        child: true,
      },
    });

    if (!vaccination) {
      throw new NotFoundException('Vaccination non trouvee');
    }

    return vaccination;
  }

  async create(dto: CreateVaccinationDto) {
    const data: any = {
      ...dto,
      date: new Date(dto.date),
    };

    if (dto.boosterDate) {
      data.boosterDate = new Date(dto.boosterDate);
    }

    const vaccination = await this.prisma.vaccination.create({
      data,
      include: {
        patient: { include: { user: true } },
        child: true,
      },
    });

    return vaccination;
  }

  async update(id: string, dto: UpdateVaccinationDto) {
    const existing = await this.prisma.vaccination.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Vaccination non trouvee');
    }

    const data: any = { ...dto };
    if (dto.date) {
      data.date = new Date(dto.date);
    }
    if (dto.boosterDate) {
      data.boosterDate = new Date(dto.boosterDate);
    }

    return this.prisma.vaccination.update({
      where: { id },
      data,
      include: {
        patient: { include: { user: true } },
        child: true,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.vaccination.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Vaccination non trouvee');
    }

    await this.prisma.vaccination.delete({ where: { id } });

    return { message: 'Vaccination supprimee avec succes' };
  }
}
