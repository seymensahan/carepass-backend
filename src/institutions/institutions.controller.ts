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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { InstitutionsService } from './institutions.service';
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
  constructor(private readonly institutionsService: InstitutionsService) {}

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
  getStats(@Param('id') id: string) {
    return this.institutionsService.getStats(id);
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
}
