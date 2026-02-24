import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { EmergencyService } from './emergency.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('emergency')
@UseGuards(JwtAuthGuard)
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

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
