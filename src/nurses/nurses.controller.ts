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
@Controller('nurses')
export class NursesController {
  constructor(private readonly service: NursesService) {}

  /**
   * GET /nurses
   * List all nurses (super_admin only).
   * Used by the super admin dashboard to include nurses in the user list.
   */
  @Get()
  @Roles('super_admin')
  @ApiOperation({ summary: 'Lister toutes les infirmier(e)s (super_admin)' })
  async listAllNurses(@Query('limit') limit?: string) {
    return this.service.listAll(limit ? parseInt(limit, 10) : 100);
  }

  @Get('profile')
  @Roles('nurse')
  @ApiOperation({ summary: 'Profil infirmier' })
  getProfile(@CurrentUser() user: any) {
    return this.service.getProfile(user.id);
  }

  @Get('dashboard')
  @Roles('nurse')
  @ApiOperation({ summary: 'Dashboard infirmier' })
  getDashboard(@CurrentUser() user: any) {
    return this.service.getDashboard(user.id);
  }

  @Get('hospitalisations')
  @Roles('nurse')
  @ApiOperation({ summary: 'Hospitalisations de l\'institution' })
  getHospitalisations(
    @CurrentUser() user: any,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.getInstitutionHospitalisations(user.id, activeOnly !== 'false');
  }

  @Get('hospitalisations/:id')
  @Roles('nurse')
  @ApiOperation({ summary: 'Détail d\'une hospitalisation' })
  getHospitalisationDetail(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.service.getHospitalisationDetail(user.id, id);
  }

  @Post('care-plan/:itemId/execute')
  @Roles('nurse')
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
  @Roles('nurse')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer des constantes vitales' })
  addVital(@CurrentUser() user: any, @Body() dto: AddVitalNurseDto) {
    return this.service.addVital(user.id, dto);
  }

  @Get('my-executions')
  @Roles('nurse')
  @ApiOperation({ summary: 'Mes exécutions récentes' })
  getMyExecutions(
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    return this.service.getMyExecutions(user.id, days ? parseInt(days) : 7);
  }

  @Get('pending-tasks')
  @Roles('nurse')
  @ApiOperation({ summary: 'Mes tâches en attente' })
  getPendingTasks(@CurrentUser() user: any) {
    return this.service.getPendingTasks(user.id);
  }

  @Get('patient-lookup/:carypassId')
  @Roles('nurse')
  @ApiOperation({ summary: 'Rechercher un patient par CaryPass ID (scan QR)' })
  patientLookup(
    @Param('carypassId') carypassId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.lookupPatientByCarypassId(carypassId);
  }

  @Get('my-patients')
  @Roles('nurse')
  @ApiOperation({ summary: 'Patients pris en charge par cette infirmière' })
  getMyPatients(@CurrentUser() user: any) {
    return this.service.getMyPatients(user.id);
  }

  /**
   * Detailed view of a nurse for the institution admin: profile, performance
   * metrics, recent task history, hospitalisations managed, vitals recorded.
   */
  @Get(':nurseId/detail')
  @Roles('institution_admin', 'super_admin')
  @ApiOperation({ summary: 'Détail complet d\'un(e) infirmier(e) — pour l\'admin institution' })
  getNurseDetailForAdmin(
    @CurrentUser() user: any,
    @Param('nurseId') nurseId: string,
  ) {
    return this.service.getNurseDetailForAdmin(user, nurseId);
  }
}
