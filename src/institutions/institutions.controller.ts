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
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { InstitutionsService } from './institutions.service';
import { InvitationsService } from './invitations.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { InstitutionFilterDto } from './dto/institution-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('institutions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('institutions')
export class InstitutionsController {
  constructor(
    private readonly institutionsService: InstitutionsService,
    private readonly invitationsService: InvitationsService,
  ) {}

  /**
   * GET /institutions
   * Liste paginee des institutions avec filtres.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les institutions' })
  @ApiResponse({ status: 200, description: 'Liste des institutions' })
  findAll(@Query() filters: InstitutionFilterDto) {
    return this.institutionsService.findAll(filters);
  }

  /**
   * GET /institutions/:id
   * Obtenir une institution par ID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir une institution par ID' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Details de l\'institution' })
  @ApiResponse({ status: 404, description: 'Institution non trouvee' })
  findOne(@Param('id') id: string) {
    return this.institutionsService.findOne(id);
  }

  /**
   * POST /institutions
   * Creer une institution. Reserve au super_admin.
   */
  @Post()
  @Roles('super_admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer une institution (role: super_admin)' })
  @ApiResponse({ status: 201, description: 'Institution creee avec succes' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  create(@Body() dto: CreateInstitutionDto) {
    return this.institutionsService.create(dto);
  }

  /**
   * PATCH /institutions/:id
   * Mettre a jour une institution. Roles: institution_admin, super_admin.
   */
  @Patch(':id')
  @Roles('institution_admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre a jour une institution' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Institution mise a jour' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Institution non trouvee' })
  update(@Param('id') id: string, @Body() dto: UpdateInstitutionDto) {
    return this.institutionsService.update(id, dto);
  }

  /**
   * PATCH /institutions/:id/verify
   * Verifier une institution. Reserve au super_admin.
   */
  @Patch(':id/verify')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifier une institution (role: super_admin)' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Institution verifiee avec succes' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Institution non trouvee' })
  verify(@Param('id') id: string) {
    return this.institutionsService.verify(id);
  }

  /**
   * GET /institutions/:id/members
   * Liste paginee des membres (medecins) d'une institution.
   */
  @Get(':id/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les membres (medecins) d\'une institution' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Liste des membres' })
  @ApiResponse({ status: 404, description: 'Institution non trouvee' })
  findMembers(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.institutionsService.findMembers(id, Number(page) || 1, Number(limit) || 20);
  }

  /**
   * GET /institutions/:id/nurses
   * Liste des infirmiers d'une institution.
   */
  @Get(':id/nurses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les infirmiers d\'une institution' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Liste des infirmiers' })
  findNurses(@Param('id') id: string) {
    return this.institutionsService.findNurses(id);
  }

  /**
   * GET /institutions/:id/stats
   * Statistiques de l'institution. Role: institution_admin.
   */
  @Get(':id/stats')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir les statistiques de l\'institution' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Statistiques de l\'institution' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Institution non trouvee' })
  getStats(@Param('id') id: string, @Query('period') period?: string) {
    return this.institutionsService.getStats(id, period || '30d');
  }

  /**
   * POST /institutions/:id/documents
   * Upload des documents de vérification.
   */
  @Post(':id/documents')
  @Roles('institution_admin', 'super_admin')
  @UseInterceptors(FilesInterceptor('documents', 5))
  @ApiConsumes('multipart/form-data')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Uploader des documents de vérification' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 201, description: 'Documents uploadés avec succès' })
  uploadDocuments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.institutionsService.uploadDocuments(id, files);
  }

  /**
   * GET /institutions/:id/documents
   * Lister les documents de vérification d'une institution.
   */
  @Get(':id/documents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les documents de vérification' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Liste des documents' })
  getDocuments(@Param('id') id: string) {
    return this.institutionsService.getDocuments(id);
  }

  // ─── Invitations ───

  /**
   * POST /institutions/:id/invitations
   * Send an invitation to a doctor or nurse.
   */
  @Post(':id/invitations')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Envoyer une invitation par email' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  createInvitation(
    @Param('id') id: string,
    @Body() body: { email: string; role: 'doctor' | 'nurse'; message?: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.invitationsService.createInvitation(id, user.id, body.email, body.role, body.message);
  }

  /**
   * GET /institutions/:id/invitations
   * List invitations for an institution.
   */
  @Get(':id/invitations')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les invitations' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  getInvitations(@Param('id') id: string) {
    return this.invitationsService.getInvitations(id);
  }

  /**
   * DELETE /institutions/:id/invitations/:invitationId
   * Cancel a pending invitation.
   */
  @Delete(':id/invitations/:invitationId')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler une invitation' })
  cancelInvitation(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.cancelInvitation(invitationId, id);
  }

  /**
   * DELETE /institutions/:id
   * Supprimer une institution. Reserve au super_admin.
   */
  @Delete(':id')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une institution (role: super_admin)' })
  @ApiParam({ name: 'id', description: 'ID de l\'institution' })
  @ApiResponse({ status: 200, description: 'Institution supprimee' })
  @ApiResponse({ status: 400, description: 'Des medecins sont encore rattaches' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Institution non trouvee' })
  remove(@Param('id') id: string) {
    return this.institutionsService.remove(id);
  }

  // ─── Hospitalisation Nurse Assignment ───

  /**
   * GET /institutions/:id/hospitalisations
   * List hospitalisations of the institution with assigned nurses.
   */
  @Get(':id/hospitalisations')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les hospitalisations de l\'institution' })
  getHospitalisations(@Param('id') id: string, @Query('status') status?: string) {
    return this.institutionsService.getHospitalisations(id, status);
  }

  /**
   * POST /institutions/:id/hospitalisations/:hospId/assign-nurse
   * Assign a nurse to a hospitalisation.
   */
  @Post(':id/hospitalisations/:hospId/assign-nurse')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assigner un infirmier à une hospitalisation' })
  assignNurse(
    @Param('id') id: string,
    @Param('hospId') hospId: string,
    @Body() body: { nurseId: string },
  ) {
    return this.institutionsService.assignNurseToHospitalisation(id, hospId, body.nurseId);
  }

  /**
   * DELETE /institutions/:id/hospitalisations/:hospId/unassign-nurse/:nurseId
   * Remove a nurse assignment from a hospitalisation.
   */
  @Delete(':id/hospitalisations/:hospId/unassign-nurse/:nurseId')
  @Roles('institution_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un infirmier d\'une hospitalisation' })
  unassignNurse(
    @Param('id') id: string,
    @Param('hospId') hospId: string,
    @Param('nurseId') nurseId: string,
  ) {
    return this.institutionsService.unassignNurseFromHospitalisation(id, hospId, nurseId);
  }
}
