import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PregnancyService } from './pregnancy.service';
import { CreatePregnancyDto } from './dto/create-pregnancy.dto';
import { UpdatePregnancyDto } from './dto/update-pregnancy.dto';
import { CreatePregnancyAppointmentDto } from './dto/create-pregnancy-appointment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('pregnancy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('patient')
@Controller('pregnancy')
export class PregnancyController {
  constructor(private readonly pregnancyService: PregnancyService) {}

  /**
   * POST /pregnancy
   * Declare a new pregnancy (after positive test).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Déclarer une grossesse (après test positif)' })
  @ApiResponse({ status: 201, description: 'Grossesse créée avec rendez-vous standards' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePregnancyDto) {
    return this.pregnancyService.create(userId, dto);
  }

  /**
   * GET /pregnancy/active
   * Get the current active pregnancy with progress info.
   */
  @Get('active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir la grossesse en cours avec les informations de suivi' })
  @ApiResponse({ status: 200, description: 'Grossesse en cours' })
  getActive(@CurrentUser('id') userId: string) {
    return this.pregnancyService.getActive(userId);
  }

  /**
   * GET /pregnancy
   * Get all pregnancies (history).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Historique des grossesses' })
  @ApiResponse({ status: 200, description: 'Liste des grossesses' })
  findAll(@CurrentUser('id') userId: string) {
    return this.pregnancyService.findAll(userId);
  }

  /**
   * GET /pregnancy/:id
   * Get a specific pregnancy.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Détails d\'une grossesse' })
  @ApiParam({ name: 'id', description: 'ID de la grossesse' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.pregnancyService.findOne(userId, id);
  }

  /**
   * PATCH /pregnancy/:id
   * Update a pregnancy (status, notes, etc).
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour une grossesse' })
  @ApiParam({ name: 'id', description: 'ID de la grossesse' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePregnancyDto,
  ) {
    return this.pregnancyService.update(userId, id, dto);
  }

  /**
   * POST /pregnancy/:id/appointments
   * Add a custom appointment to the pregnancy.
   */
  @Post(':id/appointments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter un rendez-vous à la grossesse' })
  @ApiParam({ name: 'id', description: 'ID de la grossesse' })
  addAppointment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreatePregnancyAppointmentDto,
  ) {
    return this.pregnancyService.addAppointment(userId, id, dto);
  }

  /**
   * PATCH /pregnancy/appointments/:appointmentId/complete
   * Mark a pregnancy appointment as completed.
   */
  @Patch('appointments/:appointmentId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer un rendez-vous de grossesse comme terminé' })
  @ApiParam({ name: 'appointmentId', description: 'ID du rendez-vous' })
  completeAppointment(
    @CurrentUser('id') userId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { results?: any },
  ) {
    return this.pregnancyService.completeAppointment(userId, appointmentId, body?.results);
  }

  /**
   * POST /pregnancy/:id/vitals
   * Log weight and blood pressure for pregnancy tracking.
   */
  @Post(':id/vitals')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer le poids et/ou la tension artérielle' })
  @ApiParam({ name: 'id', description: 'ID de la grossesse' })
  logVitals(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { weight?: number; systolic?: number; diastolic?: number },
  ) {
    return this.pregnancyService.logVitals(userId, id, body);
  }
}
