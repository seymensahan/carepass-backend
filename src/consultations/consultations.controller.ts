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
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ConsultationFilterDto } from './dto/consultation-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('consultations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultations')
export class ConsultationsController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * GET /consultations
   * List consultations filtered by the authenticated user's role.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les consultations (filtrees par role)' })
  @ApiResponse({ status: 200, description: 'Liste des consultations' })
  findAll(@Query() filters: ConsultationFilterDto, @CurrentUser() user: any) {
    return this.consultationsService.findAll(filters, user);
  }

  /**
   * GET /consultations/:id
   * Get a consultation by ID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir une consultation par ID' })
  @ApiParam({ name: 'id', description: 'ID de la consultation' })
  @ApiResponse({ status: 200, description: 'Details de la consultation' })
  @ApiResponse({ status: 404, description: 'Consultation non trouvee' })
  findOne(@Param('id') id: string) {
    return this.consultationsService.findOne(id);
  }

  /**
   * POST /consultations
   * Create a new consultation. Role: doctor.
   */
  @Post()
  @Roles('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer une consultation' })
  @ApiResponse({ status: 201, description: 'Consultation creee avec succes' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  async create(@Body() dto: CreateConsultationDto, @CurrentUser() user: any) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }
    return this.consultationsService.create(doctor.id, dto);
  }

  /**
   * PATCH /consultations/:id
   * Update a consultation record. Only the creating doctor can update.
   */
  @Patch(':id')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier une consultation' })
  @ApiParam({ name: 'id', description: 'ID de la consultation' })
  @ApiResponse({ status: 200, description: 'Consultation mise a jour' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Consultation non trouvee' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConsultationDto,
    @CurrentUser() user: any,
  ) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }
    return this.consultationsService.update(id, doctor.id, dto);
  }

  /**
   * DELETE /consultations/:id
   * Delete a consultation record. Only the creating doctor can delete.
   */
  @Delete(':id')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une consultation' })
  @ApiParam({ name: 'id', description: 'ID de la consultation' })
  @ApiResponse({ status: 200, description: 'Consultation supprimee' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Consultation non trouvee' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      throw new NotFoundException('Profil medecin non trouve');
    }
    return this.consultationsService.remove(id, doctor.id);
  }

  /**
   * GET /consultations/:id/prescription
   * Get the prescription(s) associated with a consultation.
   */
  @Get(':id/prescription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir les prescriptions d\'une consultation' })
  @ApiParam({ name: 'id', description: 'ID de la consultation' })
  @ApiResponse({ status: 200, description: 'Prescriptions de la consultation' })
  @ApiResponse({ status: 404, description: 'Consultation non trouvee' })
  getPrescription(@Param('id') id: string) {
    return this.consultationsService.getPrescription(id);
  }

  /**
   * GET /consultations/:id/pdf
   * Generate a PDF report for a consultation.
   */
  @Get(':id/pdf')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generer le PDF d\'une consultation' })
  @ApiParam({ name: 'id', description: 'ID de la consultation' })
  @ApiResponse({ status: 200, description: 'Donnees PDF de la consultation' })
  @ApiResponse({ status: 404, description: 'Consultation non trouvee' })
  generatePdf(@Param('id') id: string) {
    return this.consultationsService.generatePdf(id);
  }
}
