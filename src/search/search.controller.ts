import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search/patients
   * Recherche de patients (roles: doctor, institution_admin, super_admin).
   */
  @Get('patients')
  @Roles('doctor', 'institution_admin', 'super_admin', 'lab')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechercher des patients (roles: doctor, institution_admin, super_admin)' })
  @ApiQuery({ name: 'q', required: true, description: 'Terme de recherche' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre maximum de resultats' })
  @ApiResponse({ status: 200, description: 'Resultats de recherche des patients' })
  searchPatients(@Query() query: SearchQueryDto, @CurrentUser() user: any) {
    return this.searchService.searchPatients(query.q, query.limit || 10, user);
  }

  /**
   * GET /search/doctors
   * Recherche de medecins (tous les utilisateurs authentifies).
   */
  @Get('doctors')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechercher des medecins' })
  @ApiQuery({ name: 'q', required: true, description: 'Terme de recherche' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre maximum de resultats' })
  @ApiResponse({ status: 200, description: 'Resultats de recherche des medecins' })
  searchDoctors(@Query() query: SearchQueryDto) {
    return this.searchService.searchDoctors(query.q, query.limit || 10);
  }

  /**
   * GET /search
   * Recherche globale sur patients et medecins.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recherche globale (patients et medecins)' })
  @ApiQuery({ name: 'q', required: true, description: 'Terme de recherche' })
  @ApiQuery({ name: 'type', required: false, description: 'Filtrer par type (patients, doctors, all)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre maximum de resultats' })
  @ApiResponse({ status: 200, description: 'Resultats de la recherche globale' })
  globalSearch(@Query() query: SearchQueryDto, @CurrentUser() user: any) {
    return this.searchService.globalSearch(query.q, query.limit || 10, user);
  }
}
