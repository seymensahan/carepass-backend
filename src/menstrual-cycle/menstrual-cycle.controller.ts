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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MenstrualCycleService } from './menstrual-cycle.service';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('menstrual-cycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('patient')
@Controller('menstrual-cycle')
export class MenstrualCycleController {
  constructor(private readonly menstrualCycleService: MenstrualCycleService) {}

  /**
   * POST /menstrual-cycle
   * Log a new menstrual cycle / period start.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer un nouveau cycle menstruel' })
  @ApiResponse({ status: 201, description: 'Cycle enregistré avec prédictions' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCycleDto) {
    return this.menstrualCycleService.create(userId, dto);
  }

  /**
   * GET /menstrual-cycle
   * Get all recorded cycles for the patient.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les cycles menstruels' })
  @ApiResponse({ status: 200, description: 'Liste des cycles' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.menstrualCycleService.findAll(userId, Number(page) || 1, Number(limit) || 12);
  }

  /**
   * GET /menstrual-cycle/predictions
   * Get predictions (next period, ovulation, fertile window).
   */
  @Get('predictions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir les prédictions (prochaines règles, ovulation, fenêtre fertile)' })
  @ApiResponse({ status: 200, description: 'Prédictions calculées' })
  getPredictions(@CurrentUser('id') userId: string) {
    return this.menstrualCycleService.getPredictions(userId);
  }

  /**
   * GET /menstrual-cycle/:id
   * Get a specific cycle.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir un cycle menstruel par ID' })
  @ApiParam({ name: 'id', description: 'ID du cycle' })
  @ApiResponse({ status: 200, description: 'Détails du cycle' })
  findOne(@CurrentUser('id') userId: string, @Param('id') cycleId: string) {
    return this.menstrualCycleService.findOne(userId, cycleId);
  }

  /**
   * PATCH /menstrual-cycle/:id
   * Update a cycle entry.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour un cycle menstruel' })
  @ApiParam({ name: 'id', description: 'ID du cycle' })
  @ApiResponse({ status: 200, description: 'Cycle mis à jour' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') cycleId: string,
    @Body() dto: UpdateCycleDto,
  ) {
    return this.menstrualCycleService.update(userId, cycleId, dto);
  }

  /**
   * DELETE /menstrual-cycle/:id
   * Delete a cycle entry.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un cycle menstruel' })
  @ApiParam({ name: 'id', description: 'ID du cycle' })
  @ApiResponse({ status: 200, description: 'Cycle supprimé' })
  remove(@CurrentUser('id') userId: string, @Param('id') cycleId: string) {
    return this.menstrualCycleService.remove(userId, cycleId);
  }
}
