import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/patient
   * Tableau de bord du patient.
   */
  @Get('patient')
  @Roles('patient')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tableau de bord du patient (role: patient)' })
  @ApiResponse({ status: 200, description: 'Statistiques du patient' })
  getPatientDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getPatientDashboard(user.id);
  }

  /**
   * GET /dashboard/doctor
   * Tableau de bord du medecin.
   */
  @Get('doctor')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tableau de bord du medecin (role: doctor)' })
  @ApiResponse({ status: 200, description: 'Statistiques du medecin' })
  getDoctorDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getDoctorDashboard(user.id);
  }

  /**
   * GET /dashboard/institution
   * Tableau de bord de l'institution.
   */
  @Get('institution')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tableau de bord de l\'institution (role: institution_admin)' })
  @ApiResponse({ status: 200, description: 'Statistiques de l\'institution' })
  getInstitutionDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getInstitutionDashboard(user.id);
  }

  /**
   * GET /dashboard/lab
   * Tableau de bord du laboratoire.
   */
  @Get('lab')
  @Roles('lab')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tableau de bord du laboratoire (role: lab)' })
  @ApiResponse({ status: 200, description: 'Statistiques du laboratoire' })
  getLabDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getLabDashboard(user.id);
  }

  /**
   * GET /dashboard/insurance
   * Tableau de bord de l'assurance.
   */
  @Get('insurance')
  @Roles('insurance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tableau de bord de l\'assurance (role: insurance)' })
  @ApiResponse({ status: 200, description: 'Statistiques de l\'assurance' })
  getInsuranceDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getInsuranceDashboard(user.id);
  }

  /**
   * GET /dashboard/admin
   * Tableau de bord super admin.
   */
  @Get('admin')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tableau de bord super admin (role: super_admin)' })
  @ApiResponse({ status: 200, description: 'Statistiques globales de la plateforme' })
  getAdminDashboard() {
    return this.dashboardService.getAdminDashboard();
  }
}
