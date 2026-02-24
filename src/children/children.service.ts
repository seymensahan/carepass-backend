import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';

@Injectable()
export class ChildrenService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List all children for the given patient.
   * Includes a count of vaccinations for each child.
   */
  async findAll(patientId: string) {
    const children = await this.prisma.child.findMany({
      where: { parentId: patientId },
      include: {
        _count: {
          select: { vaccinations: true },
        },
      },
      orderBy: { dateOfBirth: 'desc' },
    });

    return children;
  }

  /**
   * Get a single child by ID.
   * Verifies that the child belongs to the given patient.
   * Includes vaccinations.
   */
  async findOne(id: string, patientId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id },
      include: {
        vaccinations: true,
      },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    return child;
  }

  /**
   * Create a new child linked to the given patient.
   */
  async create(patientId: string, dto: CreateChildDto) {
    const child = await this.prisma.child.create({
      data: {
        parentId: patientId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: new Date(dto.dateOfBirth),
        gender: dto.gender,
        bloodGroup: dto.bloodGroup,
      },
    });

    return child;
  }

  /**
   * Update a child. Verifies ownership.
   */
  async update(id: string, patientId: string, dto: UpdateChildDto) {
    const child = await this.prisma.child.findUnique({
      where: { id },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    const updated = await this.prisma.child.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.dateOfBirth !== undefined && { dateOfBirth: new Date(dto.dateOfBirth) }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.bloodGroup !== undefined && { bloodGroup: dto.bloodGroup }),
      },
    });

    return updated;
  }

  /**
   * Delete a child. Verifies ownership.
   */
  async remove(id: string, patientId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    await this.prisma.child.delete({
      where: { id },
    });

    return { message: 'Enfant supprimé avec succès' };
  }

  /**
   * Get vaccinations for a child. Verifies parent ownership.
   */
  async getVaccinations(childId: string, patientId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });

    if (!child) {
      throw new NotFoundException('Enfant non trouvé');
    }

    if (child.parentId !== patientId) {
      throw new ForbiddenException('Accès refusé : cet enfant ne vous appartient pas');
    }

    const vaccinations = await this.prisma.vaccination.findMany({
      where: { childId },
      orderBy: { date: 'desc' },
    });

    return vaccinations;
  }
}
