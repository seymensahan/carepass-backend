import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateAllergyDto } from './dto/create-allergy.dto';
import { UpdateAllergyDto } from './dto/update-allergy.dto';

@Injectable()
export class AllergiesService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(patientId: string) {
    const allergies = await this.prisma.allergy.findMany({
      where: { patientId },
      orderBy: { name: 'asc' },
    });

    return { data: allergies };
  }

  async findOne(id: string) {
    const allergy = await this.prisma.allergy.findUnique({
      where: { id },
    });

    if (!allergy) {
      throw new NotFoundException('Allergie non trouvee');
    }

    return allergy;
  }

  async create(dto: CreateAllergyDto) {
    const data: any = { ...dto };

    if (dto.diagnosedAt) {
      data.diagnosedAt = new Date(dto.diagnosedAt);
    }

    return this.prisma.allergy.create({ data });
  }

  async update(id: string, dto: UpdateAllergyDto) {
    const existing = await this.prisma.allergy.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Allergie non trouvee');
    }

    const data: any = { ...dto };
    if (dto.diagnosedAt) {
      data.diagnosedAt = new Date(dto.diagnosedAt);
    }

    return this.prisma.allergy.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.allergy.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Allergie non trouvee');
    }

    await this.prisma.allergy.delete({ where: { id } });

    return { message: 'Allergie supprimee avec succes' };
  }
}
