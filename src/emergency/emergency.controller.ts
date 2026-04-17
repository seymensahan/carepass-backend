import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EmergencyService } from './emergency.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('emergency')
@UseGuards(JwtAuthGuard)
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  /**
   * GET /emergency/me/token
   * Get or create emergency token for current user.
   */
  @Get('me/token')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir/générer mon token d\'urgence' })
  getMyToken(@CurrentUser() user: any) {
    return this.emergencyService.getMyEmergencyToken(user.id);
  }

  /**
   * GET /emergency/dependents/:dependentId/token
   * Get emergency token of a dependent (guardian only).
   */
  @Get('dependents/:dependentId/token')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir le token d\'urgence d\'un dépendant (tuteur uniquement)' })
  getDependentToken(@Param('dependentId') dependentId: string, @CurrentUser() user: any) {
    return this.emergencyService.getDependentEmergencyToken(user.id, dependentId);
  }

  /**
   * GET /emergency/:token
   * Recuperer les donnees d'urgence d'un patient par son token.
   * Route PUBLIQUE — aucune authentification requise.
   */
  @Get(':token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Donnees d\'urgence par token (PUBLIC, aucune authentification)' })
  @ApiParam({ name: 'token', description: 'Token d\'urgence du patient' })
  @ApiResponse({ status: 200, description: 'Donnees d\'urgence du patient' })
  @ApiResponse({ status: 404, description: 'Token invalide ou patient non trouve' })
  getEmergencyData(@Param('token') token: string) {
    return this.emergencyService.getEmergencyData(token);
  }
}
