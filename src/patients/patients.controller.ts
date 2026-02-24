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
import { CarepassIdPipe } from '../common/pipes/validation.pipe';
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

  /**
   * GET /patients/carepass/:carepassId
   * Get a patient by CarePass ID.
   * IMPORTANT: This route MUST be before /:id to prevent "carepass" from being treated as an id.
   */
  @Get('carepass/:carepassId')
  @ApiOperation({ summary: 'Rechercher un patient par CarePass ID' })
  @ApiParam({ name: 'carepassId', description: 'CarePass ID (format: CP-YYYY-NNNNN)' })
  @ApiResponse({ status: 200, description: 'Patient trouve' })
  @ApiResponse({ status: 404, description: 'Patient non trouve' })
  async findByCarepassId(@Param('carepassId', CarepassIdPipe) carepassId: string) {
    return this.patientsService.findByCarepassId(carepassId);
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
