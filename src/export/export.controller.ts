import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
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
  async exportPatients(
    @Body() filters: ExportFilterDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportService.exportPatients(filters, user);
    if ('csv' in result) {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=${result.filename}`,
      });
      res.send(result.csv);
      return;
    }
    return result;
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
  async exportConsultations(
    @Body() filters: ExportFilterDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportService.exportConsultations(filters, user);
    if ('csv' in result) {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=${result.filename}`,
      });
      res.send(result.csv);
      return;
    }
    return result;
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
  async exportLabResults(
    @Body() filters: ExportFilterDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportService.exportLabResults(filters, user);
    if ('csv' in result) {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=${result.filename}`,
      });
      res.send(result.csv);
      return;
    }
    return result;
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
  async exportStatistics(
    @Body() filters: ExportFilterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportService.exportStatistics(filters);
    if ('csv' in result) {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=${result.filename}`,
      });
      res.send(result.csv);
      return;
    }
    return result;
  }

  /**
   * GET /export/consultations/:id/pdf
   * Generer un PDF de consultation.
   */
  @Get('consultations/:id/pdf')
  @Roles('doctor', 'patient', 'institution_admin', 'super_admin')
  @ApiOperation({ summary: 'Generer un PDF de consultation' })
  @ApiResponse({ status: 200, description: 'PDF de consultation genere' })
  async getConsultationPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.exportService.generateConsultationPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=consultation-${id}.pdf`,
    });
    res.send(pdfBuffer);
  }
}
