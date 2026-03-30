import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NursesService } from './nurses.service';
import { ExecuteCarePlanItemDto } from './dto/execute-care-plan-item.dto';
import { AddVitalNurseDto } from './dto/add-vital-nurse.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('nurses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('nurse')
@Controller('nurses')
export class NursesController {
  constructor(private readonly service: NursesService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Profil infirmier' })
  getProfile(@CurrentUser() user: any) {
    return this.service.getProfile(user.id);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard infirmier' })
  getDashboard(@CurrentUser() user: any) {
    return this.service.getDashboard(user.id);
  }

  @Get('hospitalisations')
  @ApiOperation({ summary: 'Hospitalisations de l\'institution' })
  getHospitalisations(
    @CurrentUser() user: any,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.getInstitutionHospitalisations(user.id, activeOnly !== 'false');
  }

  @Get('hospitalisations/:id')
  @ApiOperation({ summary: 'Détail d\'une hospitalisation' })
  getHospitalisationDetail(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.service.getHospitalisationDetail(user.id, id);
  }

  @Post('care-plan/:itemId/execute')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Exécuter une tâche du cahier de charges' })
  executeCarePlanItem(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Body() dto: ExecuteCarePlanItemDto,
  ) {
    return this.service.executeCarePlanItem(user.id, itemId, dto);
  }

  @Post('vitals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer des constantes vitales' })
  addVital(@CurrentUser() user: any, @Body() dto: AddVitalNurseDto) {
    return this.service.addVital(user.id, dto);
  }

  @Get('my-executions')
  @ApiOperation({ summary: 'Mes exécutions récentes' })
  getMyExecutions(
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    return this.service.getMyExecutions(user.id, days ? parseInt(days) : 7);
  }

  @Get('pending-tasks')
  @ApiOperation({ summary: 'Mes tâches en attente' })
  getPendingTasks(@CurrentUser() user: any) {
    return this.service.getPendingTasks(user.id);
  }
}
