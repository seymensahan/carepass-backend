import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /settings/user
   * Recuperer les preferences de l'utilisateur connecte.
   */
  @Get('user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recuperer les preferences utilisateur (authentification requise)' })
  @ApiResponse({ status: 200, description: 'Preferences de l\'utilisateur' })
  getUserPreferences(@CurrentUser() user: any) {
    return this.settingsService.getUserPreferences(user.id);
  }

  /**
   * PATCH /settings/user
   * Mettre a jour les preferences de l'utilisateur connecte.
   */
  @Patch('user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre a jour les preferences utilisateur (authentification requise)' })
  @ApiResponse({ status: 200, description: 'Preferences mises a jour' })
  updateUserPreferences(
    @Body() dto: UpdateUserPreferencesDto,
    @CurrentUser() user: any,
  ) {
    return this.settingsService.updateUserPreferences(user.id, dto);
  }

  /**
   * GET /settings
   * Recuperer tous les parametres systeme.
   */
  @Get()
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Parametres systeme (role: super_admin)' })
  @ApiResponse({ status: 200, description: 'Liste des parametres systeme' })
  getSystemSettings() {
    return this.settingsService.getSystemSettings();
  }

  /**
   * PATCH /settings
   * Mettre a jour les parametres systeme.
   */
  @Patch()
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre a jour les parametres systeme (role: super_admin)' })
  @ApiResponse({ status: 200, description: 'Parametres systeme mis a jour' })
  updateSystemSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: any,
  ) {
    return this.settingsService.updateSystemSettings(user.id, dto);
  }
}
