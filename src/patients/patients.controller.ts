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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientFilterDto } from './dto/patient-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CarypassIdPipe } from '../common/pipes/validation.pipe';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * GET /patients
   * List patients with pagination and role-based filtering.
   */
  @Get()
  @Roles('doctor', 'institution_admin', 'super_admin')
  @ApiOperation({ summary: 'Lister les patients' })
  @ApiResponse({ status: 200, description: 'Liste des patients' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  async findAll(@Query() filters: PatientFilterDto, @CurrentUser() user: any) {
    return this.patientsService.findAll(filters, user);
  }

  // ─── Dependents / Legal Guardianship ───
  // IMPORTANT: these routes MUST come before /:id

  /**
   * GET /patients/me/dependents
   * List dependents (minors managed by current patient).
   */
  @Get('me/dependents')
  @Roles('patient')
  @ApiOperation({ summary: 'Lister mes dépendants (mineurs sous ma tutelle)' })
  async getMyDependents(@CurrentUser() user: any) {
    return this.patientsService.getMyDependents(user.id);
  }

  /**
   * POST /patients/dependents
   * Create a new dependent (minor) under current user's guardianship.
   */
  @Post('dependents')
  @Roles('patient')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un dépendant (mineur à charge)' })
  async createDependent(@Body() body: any, @CurrentUser() user: any) {
    return this.patientsService.createDependent(user.id, body);
  }

  /**
   * PATCH /patients/dependents/:dependentId
   * Update a dependent's info.
   */
  @Patch('dependents/:dependentId')
  @Roles('patient')
  @ApiOperation({ summary: 'Modifier un dépendant' })
  async updateDependent(
    @Param('dependentId') dependentId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.patientsService.updateDependent(user.id, dependentId, body);
  }

  /**
   * POST /patients/dependents/:dependentId/transfer
   * Transfer management of a dependent (when they become of age).
   * The dependent must set a new password + email.
   */
  @Post('dependents/:dependentId/transfer')
  @Roles('patient')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transférer la gestion d\'un dépendant devenu majeur' })
  async transferDependent(
    @Param('dependentId') dependentId: string,
    @Body() body: { newEmail: string; newPassword: string; keepReadAccess?: boolean },
    @CurrentUser() user: any,
  ) {
    return this.patientsService.transferDependent(user.id, dependentId, body);
  }

  /**
   * GET /patients/carypass/:carypassId
   * Get a patient by CaryPass ID.
   * IMPORTANT: This route MUST be before /:id to prevent "carypass" from being treated as an id.
   */
  @Get('carypass/:carypassId')
  @ApiOperation({ summary: 'Rechercher un patient par CaryPass ID' })
  @ApiParam({ name: 'carypassId', description: 'CaryPass ID (format: CP-YYYY-NNNNN)' })
  @ApiResponse({ status: 200, description: 'Patient trouve' })
  @ApiResponse({ status: 404, description: 'Patient non trouve' })
  async findByCarypassId(@Param('carypassId', CarypassIdPipe) carypassId: string) {
    return this.patientsService.findByCarypassId(carypassId);
  }

  /**
   * GET /patients/by-emergency-token/:token
   * Resolve a patient by their public emergency QR token. Used by doctors who
   * scanned the patient's QR (which encodes the token, not the carypassId).
   * IMPORTANT: route declared BEFORE @Get(':id') so "by-emergency-token" is
   * not interpreted as an id.
   */
  @Get('by-emergency-token/:token')
  @ApiOperation({ summary: 'Rechercher un patient par token d\'urgence' })
  @ApiParam({ name: 'token', description: 'Token d\'urgence (32-char hex)' })
  @ApiResponse({ status: 200, description: 'Patient trouve' })
  @ApiResponse({ status: 404, description: 'Patient non trouve' })
  async findByEmergencyToken(@Param('token') token: string) {
    return this.patientsService.findByEmergencyToken(token);
  }

  /**
   * GET /patients/:id
   * Get a single patient by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un patient par ID' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Patient trouve' })
  @ApiResponse({ status: 404, description: 'Patient non trouve' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.patientsService.findOne(id, user);
  }

  /**
   * POST /patients
   * Create a patient profile. Only users with role 'patient' can create.
   */
  @Post()
  @Roles('patient')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer un profil patient' })
  @ApiResponse({ status: 201, description: 'Profil patient cree' })
  @ApiResponse({ status: 409, description: 'Profil patient deja existant' })
  async create(@Body() dto: CreatePatientDto, @CurrentUser() user: any) {
    return this.patientsService.create(user.id, dto);
  }

  /**
   * PATCH /patients/:id
   * Update a patient profile. Only the patient themselves can update.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour un profil patient' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Profil patient mis a jour' })
  @ApiResponse({ status: 403, description: 'Modification non autorisee' })
  @ApiResponse({ status: 404, description: 'Patient non trouve' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: any,
  ) {
    return this.patientsService.update(id, user.id, dto);
  }

  /**
   * GET /patients/:id/medical-history
   * Get full medical history for a patient.
   */
  @Get(':id/medical-history')
  @ApiOperation({ summary: 'Obtenir l\'historique medical complet' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Historique medical' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Patient non trouve' })
  async getMedicalHistory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.patientsService.getMedicalHistory(id, user);
  }

  /**
   * GET /patients/:id/consultations
   * List consultations for a patient (paginated).
   */
  @Get(':id/consultations')
  @ApiOperation({ summary: 'Lister les consultations d\'un patient' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Liste des consultations' })
  async getConsultations(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.patientsService.getConsultations(id, query);
  }

  /**
   * GET /patients/:id/lab-results
   * List lab results for a patient (paginated).
   */
  @Get(':id/lab-results')
  @ApiOperation({ summary: 'Lister les resultats de laboratoire d\'un patient' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Liste des resultats de laboratoire' })
  async getLabResults(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.patientsService.getLabResults(id, query);
  }

  /**
   * GET /patients/:id/vaccinations
   * List vaccinations for a patient (paginated).
   */
  @Get(':id/vaccinations')
  @ApiOperation({ summary: 'Lister les vaccinations d\'un patient' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Liste des vaccinations' })
  async getVaccinations(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.patientsService.getVaccinations(id, query);
  }

  /**
   * GET /patients/:id/allergies
   * List allergies for a patient (no pagination).
   */
  @Get(':id/allergies')
  @ApiOperation({ summary: 'Lister les allergies d\'un patient' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Liste des allergies' })
  async getAllergies(@Param('id') id: string) {
    return this.patientsService.getAllergies(id);
  }

  /**
   * GET /patients/:id/conditions
   * List medical conditions for a patient (no pagination).
   */
  @Get(':id/conditions')
  @ApiOperation({ summary: 'Lister les conditions medicales d\'un patient' })
  @ApiParam({ name: 'id', description: 'Patient ID' })
  @ApiResponse({ status: 200, description: 'Liste des conditions medicales' })
  async getConditions(@Param('id') id: string) {
    return this.patientsService.getConditions(id);
  }
}
