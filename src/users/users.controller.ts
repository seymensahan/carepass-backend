import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/profile
   * Get the authenticated user's profile.
   */
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir le profil de l\'utilisateur connecté' })
  @ApiResponse({ status: 200, description: 'Profil récupéré avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  /**
   * PATCH /users/profile
   * Update the authenticated user's profile.
   */
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour le profil' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  /**
   * PATCH /users/change-password
   * Change password for the authenticated user.
   */
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer le mot de passe' })
  @ApiResponse({ status: 200, description: 'Mot de passe modifié avec succès' })
  @ApiResponse({ status: 401, description: 'Mot de passe actuel incorrect' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto);
  }

  /**
   * POST /users/avatar
   * Upload an avatar image for the authenticated user.
   */
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Télécharger un avatar' })
  @ApiResponse({ status: 200, description: 'Avatar mis à jour avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: any,
  ) {
    return this.usersService.uploadAvatar(userId, file);
  }

  /**
   * POST /users/ensure-patient-profile
   * Ensure the user has a Patient profile (for doctors/nurses wanting to manage
   * their own medical records).
   */
  @Post('ensure-patient-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Créer un profil patient pour soi-même (docteurs/infirmières)' })
  async ensurePatientProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: { dateOfBirth?: string; gender?: string; bloodGroup?: string },
  ) {
    return this.usersService.ensurePatientProfile(userId, dto);
  }

  /**
   * POST /users/add-doctor-role
   * Allow a user to also become a doctor (creates Doctor profile, pending verification).
   */
  @Post('add-doctor-role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devenir médecin (en plus du rôle actuel)' })
  async addDoctorRole(
    @CurrentUser('id') userId: string,
    @Body() dto: {
      specialty: string;
      licenseNumber: string;
      institutionId?: string;
      bio?: string;
      city?: string;
      region?: string;
    },
  ) {
    return this.usersService.addDoctorRole(userId, dto);
  }

  /**
   * POST /users/add-nurse-role
   * Allow a patient to also become a nurse (creates Nurse profile).
   */
  @Post('add-nurse-role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devenir infirmier (en plus du rôle patient)' })
  @ApiResponse({ status: 200, description: 'Profil infirmier créé' })
  async addNurseRole(
    @CurrentUser('id') userId: string,
    @Body() dto: { institutionId: string; specialty: string; licenseNumber: string },
  ) {
    return this.usersService.addNurseRole(userId, dto);
  }

  /**
   * POST /users/switch-role
   * Switch the active role (must be in availableRoles).
   */
  @Post('switch-role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Basculer entre les rôles disponibles' })
  @ApiResponse({ status: 200, description: 'Rôle actif changé' })
  async switchRole(
    @CurrentUser('id') userId: string,
    @Body() body: { role: string },
  ) {
    return this.usersService.switchActiveRole(userId, body.role);
  }

  /**
   * DELETE /users/account
   * Soft-delete the authenticated user's account.
   */
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer le compte (désactivation)' })
  @ApiResponse({ status: 200, description: 'Compte désactivé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async deleteAccount(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAccount(userId);
  }

  /**
   * POST /users/permanent-delete
   * Permanently delete the user's account and all associated data.
   * Requires the user's current password as a confirmation.
   */
  @Post('permanent-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer définitivement le compte (RGPD)' })
  @ApiResponse({ status: 200, description: 'Compte supprimé définitivement' })
  async permanentlyDeleteAccount(
    @CurrentUser('id') userId: string,
    @Body() body: { password: string },
  ) {
    return this.usersService.permanentlyDeleteAccount(userId, body?.password);
  }

  /**
   * GET /users/me/data-export
   * Returns a full JSON export of the user's data (RGPD portability).
   */
  @Get('me/data-export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter toutes mes données (RGPD)' })
  async exportMyData(@CurrentUser('id') userId: string) {
    return this.usersService.exportMyData(userId);
  }

  // ─── Super Admin routes ───

  /**
   * PATCH /users/:id
   * Update a user (super_admin only). Used for suspend/ban.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier un utilisateur (super_admin)' })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  async adminUpdateUser(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; isBanned?: boolean },
  ) {
    return this.usersService.adminUpdateUser(id, body);
  }

  /**
   * DELETE /users/:id
   * Delete a user (super_admin only).
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un utilisateur (super_admin)' })
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur' })
  async adminDeleteUser(@Param('id') id: string) {
    return this.usersService.adminDeleteUser(id);
  }
}
