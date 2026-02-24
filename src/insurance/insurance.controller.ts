import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { InsuranceService } from './insurance.service';
import { CreateInsuranceCompanyDto } from './dto/create-insurance-company.dto';
import { UpdateInsuranceCompanyDto } from './dto/update-insurance-company.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { InsuranceFilterDto } from './dto/insurance-filter.dto';
import { ClaimFilterDto } from './dto/claim-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('insurance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurance')
export class InsuranceController {
  constructor(
    private readonly insuranceService: InsuranceService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Recuperer la compagnie d'assurance associee a l'utilisateur connecte.
   */
  private async getInsuranceCompanyId(userId: string): Promise<string> {
    const company = await this.prisma.insuranceCompany.findUnique({
      where: { userId },
    });
    if (!company) {
      throw new NotFoundException('Compagnie d\'assurance non trouvee pour cet utilisateur');
    }
    return company.id;
  }

  // ===================== COMPANIES =====================

  /**
   * GET /insurance/companies
   * Liste paginee des compagnies d'assurance.
   */
  @Get('companies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les compagnies d\'assurance' })
  @ApiResponse({ status: 200, description: 'Liste des compagnies d\'assurance' })
  findAllCompanies(@Query() filters: InsuranceFilterDto) {
    return this.insuranceService.findAllCompanies(filters);
  }

  /**
   * GET /insurance/companies/:id
   * Obtenir une compagnie d'assurance par ID.
   */
  @Get('companies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir une compagnie d\'assurance par ID' })
  @ApiParam({ name: 'id', description: 'ID de la compagnie' })
  @ApiResponse({ status: 200, description: 'Details de la compagnie' })
  @ApiResponse({ status: 404, description: 'Compagnie non trouvee' })
  findOneCompany(@Param('id') id: string) {
    return this.insuranceService.findOneCompany(id);
  }

  /**
   * POST /insurance/companies
   * Creer une compagnie d'assurance. Reserve au super_admin.
   */
  @Post('companies')
  @Roles('super_admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer une compagnie d\'assurance (role: super_admin)' })
  @ApiResponse({ status: 201, description: 'Compagnie creee avec succes' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  createCompany(@Body() dto: CreateInsuranceCompanyDto) {
    return this.insuranceService.createCompany(dto);
  }

  /**
   * PATCH /insurance/companies/:id
   * Mettre a jour une compagnie d'assurance.
   */
  @Patch('companies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre a jour une compagnie d\'assurance' })
  @ApiParam({ name: 'id', description: 'ID de la compagnie' })
  @ApiResponse({ status: 200, description: 'Compagnie mise a jour' })
  @ApiResponse({ status: 404, description: 'Compagnie non trouvee' })
  updateCompany(@Param('id') id: string, @Body() dto: UpdateInsuranceCompanyDto) {
    return this.insuranceService.updateCompany(id, dto);
  }

  // ===================== PATIENTS =====================

  /**
   * GET /insurance/patients
   * Liste des patients assures. Role: insurance.
   */
  @Get('patients')
  @Roles('insurance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les patients assures (role: insurance)' })
  @ApiResponse({ status: 200, description: 'Liste des patients assures' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  async findInsuredPatients(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const companyId = await this.getInsuranceCompanyId(user.id);
    return this.insuranceService.findInsuredPatients(companyId, Number(page) || 1, Number(limit) || 20);
  }

  /**
   * GET /insurance/patients/:id
   * Detail d'un patient assure.
   */
  @Get('patients/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir le detail d\'un patient assure' })
  @ApiParam({ name: 'id', description: 'ID du patient' })
  @ApiResponse({ status: 200, description: 'Detail du patient assure' })
  @ApiResponse({ status: 404, description: 'Patient non trouve' })
  async findInsuredPatientDetail(@Param('id') id: string, @CurrentUser() user: any) {
    const companyId = await this.getInsuranceCompanyId(user.id);
    return this.insuranceService.findInsuredPatientDetail(id, companyId);
  }

  // ===================== CLAIMS =====================

  /**
   * GET /insurance/claims
   * Liste paginee des reclamations. Role: insurance.
   */
  @Get('claims')
  @Roles('insurance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les reclamations (role: insurance)' })
  @ApiResponse({ status: 200, description: 'Liste des reclamations' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  async findAllClaims(@CurrentUser() user: any, @Query() filters: ClaimFilterDto) {
    const companyId = await this.getInsuranceCompanyId(user.id);
    return this.insuranceService.findAllClaims(companyId, filters);
  }

  /**
   * GET /insurance/claims/:id
   * Obtenir une reclamation par ID.
   */
  @Get('claims/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir une reclamation par ID' })
  @ApiParam({ name: 'id', description: 'ID de la reclamation' })
  @ApiResponse({ status: 200, description: 'Details de la reclamation' })
  @ApiResponse({ status: 404, description: 'Reclamation non trouvee' })
  findOneClaim(@Param('id') id: string) {
    return this.insuranceService.findOneClaim(id);
  }

  /**
   * POST /insurance/claims
   * Creer une reclamation d'assurance.
   */
  @Post('claims')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Soumettre une nouvelle reclamation d\'assurance' })
  @ApiResponse({ status: 201, description: 'Reclamation creee avec succes' })
  @ApiResponse({ status: 404, description: 'Patient ou consultation non trouve' })
  async createClaim(@Body() dto: CreateClaimDto, @CurrentUser() user: any) {
    const companyId = await this.getInsuranceCompanyId(user.id);
    return this.insuranceService.createClaim(companyId, dto);
  }

  /**
   * PATCH /insurance/claims/:id/status
   * Mettre a jour le statut d'une reclamation. Role: insurance.
   */
  @Patch('claims/:id/status')
  @Roles('insurance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre a jour le statut d\'une reclamation (role: insurance)' })
  @ApiParam({ name: 'id', description: 'ID de la reclamation' })
  @ApiResponse({ status: 200, description: 'Statut de la reclamation mis a jour' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Reclamation non trouvee' })
  updateClaimStatus(@Param('id') id: string, @Body() dto: UpdateClaimStatusDto) {
    return this.insuranceService.updateClaimStatus(id, dto);
  }

  // ===================== DASHBOARD =====================

  /**
   * GET /insurance/dashboard
   * Tableau de bord de la compagnie d'assurance. Role: insurance.
   */
  @Get('dashboard')
  @Roles('insurance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tableau de bord d\'assurance (role: insurance)' })
  @ApiResponse({ status: 200, description: 'Statistiques du tableau de bord' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  async getDashboard(@CurrentUser() user: any) {
    const companyId = await this.getInsuranceCompanyId(user.id);
    return this.insuranceService.getDashboard(companyId);
  }
}
