import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // REGISTER
  // ---------------------------------------------------------------------------
  async register(dto: RegisterDto) {
    // Check email uniqueness
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Un compte avec cet email existe déjà');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    // If role is patient, create Patient record with CarePass ID
    if (dto.role === Role.patient) {
      const carepassId = await this.generateCarepassId();
      await this.prisma.patient.create({
        data: {
          userId: user.id,
          carepassId,
          dateOfBirth: new Date('2000-01-01'), // Default, to be updated by the patient later
        },
      });
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------------
  async login(dto: LoginDto) {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte a été désactivé');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // FORGOT PASSWORD
  // ---------------------------------------------------------------------------
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      this.logger.warn(`Tentative de réinitialisation pour un email inexistant: ${dto.email}`);
      return { message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé' };
    }

    // Generate a reset token
    const resetToken = uuidv4();
    this.logger.log(`Token de réinitialisation pour ${dto.email}: ${resetToken}`);
    // TODO: Send reset email with the token
    // TODO: Store hashed token in password_reset_tokens table when available

    return { message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé' };
  }

  // ---------------------------------------------------------------------------
  // RESET PASSWORD
  // ---------------------------------------------------------------------------
  async resetPassword(dto: ResetPasswordDto) {
    // TODO: Implement fully once password_reset_tokens table is available
    return { message: 'Fonctionnalité à implémenter avec la table de tokens' };
  }

  // ---------------------------------------------------------------------------
  // VERIFY EMAIL
  // ---------------------------------------------------------------------------
  async verifyEmail(dto: VerifyEmailDto) {
    // In a real implementation, we would verify the token against a stored hash.
    // For now, we use the token as the user ID to mark the email as verified.
    const user = await this.prisma.user.findUnique({
      where: { id: dto.token },
    });

    if (!user) {
      throw new NotFoundException('Token de vérification invalide');
    }

    if (user.emailVerifiedAt) {
      return { message: 'Email déjà vérifié' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    return { message: 'Email vérifié avec succès' };
  }

  // ---------------------------------------------------------------------------
  // REFRESH TOKEN
  // ---------------------------------------------------------------------------
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Utilisateur non trouvé ou désactivé');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user.id, user.email, user.role);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }
  }

  // ---------------------------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------------------------
  async logout() {
    // Token invalidation is handled client-side by deleting the tokens.
    // In a production system, we would add the token to a blacklist (Redis).
    return { message: 'Déconnexion réussie' };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Generate access and refresh JWT tokens for a given user.
   */
  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Generate a unique CarePass ID in the format CP-YYYY-XXXXX.
   * Uses a transactional counter stored in SystemSetting.
   */
  private async generateCarepassId(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await this.prisma.$transaction(async (tx) => {
      const setting = await tx.systemSetting.findUnique({
        where: { key: 'carepass_id_counter' },
      });
      const counter = parseInt(setting?.value || '0') + 1;
      await tx.systemSetting.upsert({
        where: { key: 'carepass_id_counter' },
        update: { value: counter.toString() },
        create: {
          key: 'carepass_id_counter',
          value: counter.toString(),
          description: 'Compteur CarePass ID',
        },
      });
      return counter;
    });
    return `CP-${year}-${result.toString().padStart(5, '0')}`;
  }
}
