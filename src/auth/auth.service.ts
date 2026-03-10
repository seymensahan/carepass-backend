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
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
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
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : new Date('2000-01-01'),
          gender: dto.gender as any || undefined,
          bloodGroup: dto.bloodGroup || undefined,
        },
      });
    }

    // Send email verification
    const verificationToken = uuidv4();
    const tokenHash = this.hashToken(verificationToken);
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Send emails (non-blocking)
    this.emailService.sendEmailVerification(user.email, user.firstName, verificationToken).catch(() => {});
    this.emailService.sendWelcomeEmail(user.email, user.firstName).catch(() => {});

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Fetch patient data for the response
    const patient = dto.role === Role.patient
      ? await this.prisma.patient.findUnique({ where: { userId: user.id } })
      : null;

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        gender: patient?.gender || null,
        dateOfBirth: patient?.dateOfBirth?.toISOString() || null,
        bloodGroup: patient?.bloodGroup || null,
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

    // Fetch patient data for the response
    const patient = user.role === Role.patient
      ? await this.prisma.patient.findUnique({ where: { userId: user.id } })
      : null;

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        gender: patient?.gender || null,
        dateOfBirth: patient?.dateOfBirth?.toISOString() || null,
        bloodGroup: patient?.bloodGroup || null,
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

    // Invalidate any existing tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a reset token
    const resetToken = uuidv4();
    const tokenHash = this.hashToken(resetToken);

    // Store hashed token
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Send reset email
    await this.emailService.sendPasswordResetEmail(user.email, user.firstName, resetToken);

    return { message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé' };
  }

  // ---------------------------------------------------------------------------
  // RESET PASSWORD
  // ---------------------------------------------------------------------------
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);

    // Find the token
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Token de réinitialisation invalide ou expiré');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update password and mark token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // ---------------------------------------------------------------------------
  // VERIFY EMAIL
  // ---------------------------------------------------------------------------
  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = this.hashToken(dto.token);

    // Find the verification token
    const verificationToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!verificationToken) {
      throw new BadRequestException('Token de vérification invalide ou expiré');
    }

    if (verificationToken.user.emailVerifiedAt) {
      return { message: 'Email déjà vérifié' };
    }

    // Mark email as verified and token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

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
  // RESEND VERIFICATION EMAIL
  // ---------------------------------------------------------------------------
  async resendVerificationEmail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.emailVerifiedAt) {
      return { message: 'Email déjà vérifié' };
    }

    // Invalidate existing tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Create new token
    const verificationToken = uuidv4();
    const tokenHash = this.hashToken(verificationToken);
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await this.emailService.sendEmailVerification(user.email, user.firstName, verificationToken);

    return { message: 'Email de vérification renvoyé' };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

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
