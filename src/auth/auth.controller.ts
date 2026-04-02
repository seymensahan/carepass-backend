import { Controller, Post, Get, Body, Headers, HttpCode, HttpStatus, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { InvitationsService } from '../institutions/invitations.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly invitationsService: InvitationsService,
  ) {}

  /**
   * GET /auth/validate-invitation?token=xxx
   * Validate an invitation token. Public route.
   */
  @Get('validate-invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider un token d\'invitation' })
  @ApiResponse({ status: 200, description: 'Invitation valide' })
  @ApiResponse({ status: 404, description: 'Invitation invalide ou expirée' })
  async validateInvitation(@Query('token') token: string) {
    return this.invitationsService.validateToken(token);
  }

  /**
   * POST /auth/register
   * Register a new user. Public route.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Inscription d\'un nouvel utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Authenticate user and return JWT tokens. Public route.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur' })
  @ApiResponse({ status: 200, description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/forgot-password
   * Send a password reset email. Public route.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demande de réinitialisation du mot de passe' })
  @ApiResponse({ status: 200, description: 'Email envoyé si le compte existe' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * POST /auth/reset-password
   * Reset password using a token. Public route.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialisation du mot de passe' })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * POST /auth/verify-email
   * Verify user email address. Public route.
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérification de l\'email' })
  @ApiResponse({ status: 200, description: 'Email vérifié avec succès' })
  @ApiResponse({ status: 404, description: 'Token invalide' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  /**
   * POST /auth/refresh-token
   * Refresh an expired JWT access token. Public route.
   */
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir le token JWT' })
  @ApiResponse({ status: 200, description: 'Nouveaux tokens générés' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  /**
   * POST /auth/logout
   * Invalidate refresh token and logout. Public route.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion' })
  @ApiResponse({ status: 200, description: 'Déconnexion réussie' })
  async logout(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    return this.authService.logout(token);
  }

  /**
   * POST /auth/resend-verification
   * Resend email verification link.
   */
  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renvoyer l\'email de vérification' })
  @ApiResponse({ status: 200, description: 'Email de vérification renvoyé' })
  async resendVerification(@CurrentUser('id') userId: string) {
    return this.authService.resendVerificationEmail(userId);
  }

  /**
   * POST /auth/switch-role
   * Switch active role for a multi-role user.
   */
  @Post('switch-role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer de rôle actif' })
  @ApiResponse({ status: 200, description: 'Rôle changé avec succès' })
  @ApiResponse({ status: 401, description: 'Rôle non disponible' })
  async switchRole(@CurrentUser('id') userId: string, @Body() body: { role: string }) {
    return this.authService.switchRole(userId, body.role as any);
  }

  // -------------------------------------------------------------------------
  // TWO-FACTOR AUTHENTICATION
  // -------------------------------------------------------------------------

  /**
   * POST /auth/verify-2fa
   * Verify 2FA OTP code. Public route (user not yet authenticated).
   */
  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier le code 2FA' })
  @ApiResponse({ status: 200, description: 'Code vérifié, tokens retournés' })
  @ApiResponse({ status: 401, description: 'Code invalide ou expiré' })
  async verifyTwoFactor(@Body() body: { tempToken: string; code: string }) {
    return this.authService.verifyTwoFactor(body.tempToken, body.code);
  }

  /**
   * POST /auth/enable-2fa
   * Enable two-factor authentication for the current user.
   */
  @Post('enable-2fa')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer l\'authentification à deux facteurs' })
  @ApiResponse({ status: 200, description: 'Code de vérification envoyé' })
  async enableTwoFactor(
    @CurrentUser('id') userId: string,
    @Body() body: { phone: string },
  ) {
    return this.authService.enableTwoFactor(userId, body.phone);
  }

  /**
   * POST /auth/confirm-enable-2fa
   * Confirm 2FA activation with the code received via SMS.
   */
  @Post('confirm-enable-2fa')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer l\'activation du 2FA avec le code reçu' })
  @ApiResponse({ status: 200, description: '2FA activé avec succès' })
  @ApiResponse({ status: 401, description: 'Code incorrect ou expiré' })
  async confirmEnableTwoFactor(
    @CurrentUser('id') userId: string,
    @Body() body: { code: string },
  ) {
    return this.authService.confirmEnableTwoFactor(userId, body.code);
  }

  /**
   * POST /auth/disable-2fa
   * Disable two-factor authentication (requires password confirmation).
   */
  @Post('disable-2fa')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver l\'authentification à deux facteurs' })
  @ApiResponse({ status: 200, description: '2FA désactivé' })
  @ApiResponse({ status: 401, description: 'Mot de passe incorrect' })
  async disableTwoFactor(
    @CurrentUser('id') userId: string,
    @Body() body: { password: string },
  ) {
    return this.authService.disableTwoFactor(userId, body.password);
  }

  /**
   * POST /auth/resend-otp
   * Resend OTP code during 2FA login flow. Public route.
   */
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renvoyer le code OTP' })
  @ApiResponse({ status: 200, description: 'Nouveau code envoyé' })
  @ApiResponse({ status: 401, description: 'Token temporaire invalide' })
  async resendOtp(@Body() body: { tempToken: string }) {
    return this.authService.resendOtp(body.tempToken);
  }
}
