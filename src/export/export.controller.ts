import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ExportService } from './export.service';
import { ExportFilterDto } from './dto/export-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * POST /export/patients
   * Exporter la liste des patients.
   */
  @Post('patients')
  @Roles('doctor', 'institution_admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter les patients (roles: doctor, institution_admin, super_admin)' })
  @ApiResponse({ status: 200, description: 'Donnees des patients exportees' })
  exportPatients(@Body() filters: ExportFilterDto, @CurrentUser() user: any) {
    return this.exportService.exportPatients(filters, user);
  }

  /**
   * POST /export/consultations
   * Exporter les consultations.
   */
  @Post('consultations')
  @Roles('doctor', 'institution_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter les consultations (roles: doctor, institution_admin)' })
  @ApiResponse({ status: 200, description: 'Donnees des consultations exportees' })
  exportConsultations(@Body() filters: ExportFilterDto, @CurrentUser() user: any) {
    return this.exportService.exportConsultations(filters, user);
  }

  /**
   * POST /export/lab-results
   * Exporter les resultats de laboratoire.
   */
  @Post('lab-results')
  @Roles('doctor', 'lab')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter les resultats de laboratoire (roles: doctor, lab)' })
  @ApiResponse({ status: 200, description: 'Donnees des resultats de laboratoire exportees' })
  exportLabResults(@Body() filters: ExportFilterDto, @CurrentUser() user: any) {
    return this.exportService.exportLabResults(filters, user);
  }

  /**
   * POST /export/statistics
   * Exporter les statistiques agregees.
   */
  @Post('statistics')
  @Roles('institution_admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter les statistiques (roles: institution_admin, super_admin)' })
  @ApiResponse({ status: 200, description: 'Statistiques exportees' })
  exportStatistics(@Body() filters: ExportFilterDto) {
    return this.exportService.exportStatistics(filters);
  }
}
