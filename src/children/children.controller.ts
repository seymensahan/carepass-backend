import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChildrenService } from './children.service';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';

@ApiTags('children')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('children')
export class ChildrenController {
  constructor(
    private readonly childrenService: ChildrenService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Helper: resolve the patient profile from the authenticated user.
   */
  private async getPatientId(user: any): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: user.id },
    });
    if (!patient) {
      throw new NotFoundException('Profil patient non trouvé');
    }
    return patient.id;
  }

  @Get()
  @Roles('patient')
  @ApiOperation({ summary: 'Lister les enfants du patient connecté' })
  async findAll(@CurrentUser() user: any) {
    const patientId = await this.getPatientId(user);
    return this.childrenService.findAll(patientId);
  }

  @Get(':id')
  @Roles('patient')
  @ApiOperation({ summary: 'Obtenir un enfant par ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const patientId = await this.getPatientId(user);
    return this.childrenService.findOne(id, patientId);
  }

  @Post()
  @Roles('patient')
  @ApiOperation({ summary: 'Créer un profil enfant' })
  async create(@Body() dto: CreateChildDto, @CurrentUser() user: any) {
    const patientId = await this.getPatientId(user);
    return this.childrenService.create(patientId, dto);
  }

  @Patch(':id')
  @Roles('patient')
  @ApiOperation({ summary: 'Mettre à jour un enfant' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateChildDto,
    @CurrentUser() user: any,
  ) {
    const patientId = await this.getPatientId(user);
    return this.childrenService.update(id, patientId, dto);
  }

  @Delete(':id')
  @Roles('patient')
  @ApiOperation({ summary: 'Supprimer un enfant' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const patientId = await this.getPatientId(user);
    return this.childrenService.remove(id, patientId);
  }

  @Get(':id/vaccinations')
  @Roles('patient')
  @ApiOperation({ summary: 'Lister les vaccinations d\'un enfant' })
  async findVaccinations(@Param('id') id: string, @CurrentUser() user: any) {
    const patientId = await this.getPatientId(user);
    return this.childrenService.getVaccinations(id, patientId);
  }
}
