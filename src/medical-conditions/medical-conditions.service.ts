import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateMedicalConditionDto } from './dto/create-medical-condition.dto';
import { UpdateMedicalConditionDto } from './dto/update-medical-condition.dto';

@Injectable()
export class MedicalConditionsService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(patientId: string) {
    const conditions = await this.prisma.medicalCondition.findMany({
      where: { patientId },
      orderBy: { name: 'asc' },
    });

    return { data: conditions };
  }

  async findOne(id: string) {
    const condition = await this.prisma.medicalCondition.findUnique({
      where: { id },
    });

    if (!condition) {
      throw new NotFoundException('Condition medicale non trouvee');
    }

    return condition;
  }

  async create(dto: CreateMedicalConditionDto) {
    const data: any = { ...dto };

    if (dto.diagnosedAt) {
      data.diagnosedAt = new Date(dto.diagnosedAt);
    }

    return this.prisma.medicalCondition.create({ data });
  }

  async update(id: string, dto: UpdateMedicalConditionDto) {
    const existing = await this.prisma.medicalCondition.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Condition medicale non trouvee');
    }

    const data: any = { ...dto };
    if (dto.diagnosedAt) {
      data.diagnosedAt = new Date(dto.diagnosedAt);
    }

    return this.prisma.medicalCondition.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.medicalCondition.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Condition medicale non trouvee');
    }

    await this.prisma.medicalCondition.delete({ where: { id } });

    return { message: 'Condition medicale supprimee avec succes' };
  }
}
