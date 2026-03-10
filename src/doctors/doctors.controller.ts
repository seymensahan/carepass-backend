import {
  Controller,
  Get,
  Post,
  Delete,
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
import { DoctorsService } from './doctors.service';
import { DoctorSyncService } from './doctor-sync.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorFilterDto } from './dto/doctor-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('doctors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly doctorSyncService: DoctorSyncService,
  ) {}

  /**
   * GET /doctors
   * List doctors with optional filters. All authenticated users can access.
   */
  @Get()
  @ApiOperation({ summary: 'Lister les medecins' })
  @ApiResponse({ status: 200, description: 'Liste des medecins' })
  async findAll(@Query() filters: DoctorFilterDto) {
    return this.doctorsService.findAll(filters);
  }

  /**
   * GET /doctors/:id
   * Get a single doctor by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un medecin par ID' })
  @ApiParam({ name: 'id', description: 'Doctor ID' })
  @ApiResponse({ status: 200, description: 'Medecin trouve' })
  @ApiResponse({ status: 404, description: 'Medecin non trouve' })
  async findOne(@Param('id') id: string) {
    return this.doctorsService.findOne(id);
  }

  /**
   * POST /doctors
   * Create a doctor profile. Only users with role 'doctor' can create.
   */
  @Post()
  @Roles('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer un profil medecin' })
  @ApiResponse({ status: 201, description: 'Profil medecin cree' })
  @ApiResponse({ status: 409, description: 'Profil medecin deja existant' })
  async create(@Body() dto: CreateDoctorDto, @CurrentUser() user: any) {
    return this.doctorsService.create(user.id, dto);
  }

  /**
   * PATCH /doctors/:id
   * Update a doctor profile. Only the doctor themselves can update.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour un profil medecin' })
  @ApiParam({ name: 'id', description: 'Doctor ID' })
  @ApiResponse({ status: 200, description: 'Profil medecin mis a jour' })
  @ApiResponse({ status: 403, description: 'Modification non autorisee' })
  @ApiResponse({ status: 404, description: 'Medecin non trouve' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDoctorDto,
    @CurrentUser() user: any,
  ) {
    return this.doctorsService.update(id, user.id, dto);
  }

  /**
   * PATCH /doctors/:id/verify
   * Verify a doctor's credentials. Only institution_admin or super_admin.
   */
  @Patch(':id/verify')
  @Roles('institution_admin', 'super_admin')
  @ApiOperation({ summary: 'Verifier un medecin' })
  @ApiParam({ name: 'id', description: 'Doctor ID' })
  @ApiResponse({ status: 200, description: 'Medecin verifie' })
  @ApiResponse({ status: 404, description: 'Medecin non trouve' })
  @ApiResponse({ status: 409, description: 'Medecin deja verifie' })
  async verify(@Param('id') id: string, @CurrentUser() user: any) {
    return this.doctorsService.verify(id, user.id);
  }

  /**
   * GET /doctors/:id/patients
   * List patients assigned to a doctor via AccessGrants.
   */
  @Get(':id/patients')
  @ApiOperation({ summary: 'Lister les patients d\'un medecin' })
  @ApiParam({ name: 'id', description: 'Doctor ID' })
  @ApiResponse({ status: 200, description: 'Liste des patients du medecin' })
  @ApiResponse({ status: 404, description: 'Medecin non trouve' })
  async getPatients(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.doctorsService.getPatients(id, query);
  }

  /**
   * GET /doctors/:id/stats
   * Get dashboard statistics for a doctor.
   */
  @Get(':id/stats')
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un medecin' })
  @ApiParam({ name: 'id', description: 'Doctor ID' })
  @ApiResponse({ status: 200, description: 'Statistiques du medecin' })
  @ApiResponse({ status: 404, description: 'Medecin non trouve' })
  async getStats(@Param('id') id: string) {
    return this.doctorsService.getStats(id);
  }

  // ---------------------------------------------------------------------------
  // MULTI-INSTITUTION ENDPOINTS
  // ---------------------------------------------------------------------------

  @Get(':id/institutions')
  @HttpCode(HttpStatus.OK)
  async getDoctorInstitutions(@Param('id') id: string) {
    return this.doctorsService.getDoctorInstitutions(id);
  }

  @Post(':id/institutions')
  @HttpCode(HttpStatus.CREATED)
  async addDoctorToInstitution(
    @Param('id') id: string,
    @Body() body: { institutionId: string; role?: string; isPrimary?: boolean },
  ) {
    return this.doctorsService.addDoctorToInstitution(id, body.institutionId, body.role, body.isPrimary);
  }

  @Delete(':id/institutions/:institutionId')
  @HttpCode(HttpStatus.OK)
  async removeDoctorFromInstitution(
    @Param('id') id: string,
    @Param('institutionId') institutionId: string,
  ) {
    return this.doctorsService.removeDoctorFromInstitution(id, institutionId);
  }

  // ---------------------------------------------------------------------------
  // SYNC ENDPOINTS (multi-institution dashboard)
  // ---------------------------------------------------------------------------

  @Get(':id/sync/dashboard')
  async getSyncedDashboard(@Param('id') id: string) {
    return this.doctorSyncService.getSyncedDashboard(id);
  }

  @Get(':id/sync/consultations')
  async getSyncedConsultations(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.doctorSyncService.getSyncedConsultations(id, limit ? parseInt(limit) : 50);
  }

  @Get(':id/sync/appointments')
  async getSyncedAppointments(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.doctorSyncService.getSyncedAppointments(id, limit ? parseInt(limit) : 50);
  }
}
