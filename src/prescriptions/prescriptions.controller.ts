import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { PrescriptionFilterDto } from './dto/prescription-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('prescriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * GET /prescriptions
   * List prescriptions filtered by the authenticated user's role.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les prescriptions (filtrees par role)' })
  @ApiResponse({ status: 200, description: 'Liste des prescriptions' })
  findAll(@Query() filters: PrescriptionFilterDto, @CurrentUser() user: any) {
    return this.prescriptionsService.findAll(filters, user);
  }

  /**
   * GET /prescriptions/:id
   * Get a prescription by ID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir une prescription par ID' })
  @ApiParam({ name: 'id', description: 'ID de la prescription' })
  @ApiResponse({ status: 200, description: 'Details de la prescription' })
  @ApiResponse({ status: 404, description: 'Prescription non trouvee' })
  findOne(@Param('id') id: string) {
    return this.prescriptionsService.findOne(id);
  }

  /**
   * POST /prescriptions
   * Create a new prescription. Role: doctor.
   */
  @Post()
  @Roles('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer une prescription' })
  @ApiResponse({ status: 201, description: 'Prescription creee avec succes' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  async create(@Body() dto: CreatePrescriptionDto, @CurrentUser() user: any) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }
    return this.prescriptionsService.create(doctor.id, dto);
  }

  /**
   * PATCH /prescriptions/:id
   * Update a prescription record. Only the creating doctor can update.
   */
  @Patch(':id')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier une prescription' })
  @ApiParam({ name: 'id', description: 'ID de la prescription' })
  @ApiResponse({ status: 200, description: 'Prescription mise a jour' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Prescription non trouvee' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionDto,
    @CurrentUser() user: any,
  ) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }
    return this.prescriptionsService.update(id, doctor.id, dto);
  }

  /**
   * DELETE /prescriptions/:id
   * Delete a prescription record. Only the creating doctor can delete.
   */
  @Delete(':id')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une prescription' })
  @ApiParam({ name: 'id', description: 'ID de la prescription' })
  @ApiResponse({ status: 200, description: 'Prescription supprimee' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Prescription non trouvee' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }
    return this.prescriptionsService.remove(id, doctor.id);
  }
}
