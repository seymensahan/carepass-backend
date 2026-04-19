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
import { SmsService } from '../sms/sms.service';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly tokenBlacklistService: TokenBlacklistService,
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

    // Create user with availableRoles initialized
    // Doctors and nurses also get the patient role by default so they can
    // manage their own medical file (emergency QR, personal health records...)
    const isHealthcareRole = dto.role === Role.doctor || dto.role === Role.nurse;
    const initialRoles: Role[] = isHealthcareRole
      ? [dto.role, Role.patient]
      : [dto.role];

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        availableRoles: initialRoles,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    // Create Patient record with CaryPass ID for patients, doctors, and nurses
    // (so healthcare professionals can manage their own medical file too)
    if (dto.role === Role.patient || isHealthcareRole) {
      const carypassId = await this.generateCarypassId();
      await this.prisma.patient.create({
        data: {
          userId: user.id,
          carypassId,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : new Date('2000-01-01'),
          gender: dto.gender as any || undefined,
          bloodGroup: dto.bloodGroup || undefined,
        },
      });
    }

    // If role is nurse, create Nurse profile linked to institution
    if (dto.role === Role.nurse && dto.institutionId) {
      await this.prisma.nurse.create({
        data: {
          userId: user.id,
          institutionId: dto.institutionId,
          specialty: dto.nurseSpecialty,
          licenseNumber: dto.nurseLicenseNumber,
        },
      });
    }

    // If role is doctor, create Doctor profile (solo doctor, no institution)
    if (dto.role === Role.doctor) {
      await this.prisma.doctor.create({
        data: {
          userId: user.id,
          specialty: dto.doctorSpecialty || 'Médecine générale',
          licenseNumber: dto.doctorLicenseNumber || `MED-${Date.now()}`,
          city: dto.doctorCity,
        },
      });
    }

    // If role is institution_admin, create Institution linked to this user
    if (dto.role === Role.institution_admin && dto.institutionName) {
      await this.prisma.institution.create({
        data: {
          name: dto.institutionName,
          type: dto.institutionType || 'clinic',
          address: dto.institutionAddress,
          city: dto.institutionCity,
          phone: dto.institutionPhone,
          email: dto.institutionEmail,
          adminUserId: user.id,
          isVerified: false,
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

    // Check if user has 2FA enabled
    if (user.twoFactorEnabled && user.phone) {
      // Generate and send OTP
      const { code } = await this.smsService.sendOtp(user.phone);

      // Hash and store OTP
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      // Invalidate previous OTPs for this user
      await this.prisma.otpCode.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Create new OTP
      await this.prisma.otpCode.create({
        data: {
          userId: user.id,
          code: codeHash,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        },
      });

      // Generate a temporary token (short-lived, only for 2FA verification)
      const tempToken = await this.jwtService.signAsync(
        { sub: user.id, purpose: '2fa' },
        { expiresIn: '5m' },
      );

      return {
        requiresTwoFactor: true,
        tempToken,
        message: 'Code de vérification envoyé par SMS',
      };
    }

    // If no 2FA, return tokens as before
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
        availableRoles: user.availableRoles?.length > 0 ? user.availableRoles : [user.role],
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
  // SWITCH ROLE
  // ---------------------------------------------------------------------------
  async switchRole(userId: string, newRole: Role) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');

    const available = user.availableRoles?.length > 0 ? user.availableRoles : [user.role];
    if (!available.includes(newRole)) {
      throw new UnauthorizedException(`Vous n'avez pas accès au rôle ${newRole}`);
    }

    // Update active role
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    // Generate new tokens with the new role
    const tokens = await this.generateTokens(userId, user.email, newRole);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: newRole,
        availableRoles: available,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
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
  async logout(token?: string) {
    if (token) {
      // Blacklist for remaining token lifetime (15 minutes max)
      this.tokenBlacklistService.add(token, 15 * 60 * 1000);
    }
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
  // VERIFY TWO-FACTOR CODE
  // ---------------------------------------------------------------------------
  async verifyTwoFactor(tempToken: string, code: string) {
    // Verify temp token
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken);
      if (payload.purpose !== '2fa') throw new Error();
    } catch {
      throw new UnauthorizedException('Token temporaire invalide ou expiré');
    }

    const userId = payload.sub;
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // Find valid OTP
    const otpCode = await this.prisma.otpCode.findFirst({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpCode) {
      throw new UnauthorizedException('Code expiré. Veuillez vous reconnecter.');
    }

    // Check max attempts (3)
    if (otpCode.attempts >= 3) {
      await this.prisma.otpCode.update({
        where: { id: otpCode.id },
        data: { usedAt: new Date() },
      });
      throw new UnauthorizedException('Trop de tentatives. Veuillez vous reconnecter.');
    }

    // Increment attempts
    await this.prisma.otpCode.update({
      where: { id: otpCode.id },
      data: { attempts: otpCode.attempts + 1 },
    });

    // Verify code
    if (otpCode.code !== codeHash) {
      throw new UnauthorizedException(
        `Code incorrect. ${2 - otpCode.attempts} tentative(s) restante(s).`,
      );
    }

    // Mark as used
    await this.prisma.otpCode.update({
      where: { id: otpCode.id },
      data: { usedAt: new Date() },
    });

    // Get user and generate real tokens
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    const patient =
      user.role === 'patient'
        ? await this.prisma.patient.findUnique({ where: { userId: user.id } })
        : null;

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        availableRoles:
          user.availableRoles?.length > 0 ? user.availableRoles : [user.role],
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
  // ENABLE TWO-FACTOR
  // ---------------------------------------------------------------------------
  async enableTwoFactor(userId: string, phone: string) {
    // Send verification OTP first
    const { code } = await this.smsService.sendOtp(phone);
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    await this.prisma.otpCode.create({
      data: {
        userId,
        code: codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return {
      message: 'Code de vérification envoyé. Confirmez pour activer le 2FA.',
    };
  }

  // ---------------------------------------------------------------------------
  // CONFIRM ENABLE TWO-FACTOR
  // ---------------------------------------------------------------------------
  async confirmEnableTwoFactor(userId: string, code: string) {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const otpCode = await this.prisma.otpCode.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpCode || otpCode.code !== codeHash) {
      throw new UnauthorizedException('Code incorrect ou expiré');
    }

    await this.prisma.$transaction([
      this.prisma.otpCode.update({
        where: { id: otpCode.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true, twoFactorMethod: 'sms' },
      }),
    ]);

    return {
      message: 'Authentification à deux facteurs activée avec succès',
    };
  }

  // ---------------------------------------------------------------------------
  // DISABLE TWO-FACTOR
  // ---------------------------------------------------------------------------
  async disableTwoFactor(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Mot de passe incorrect');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorMethod: null },
    });

    return { message: 'Authentification à deux facteurs désactivée' };
  }

  // ---------------------------------------------------------------------------
  // RESEND OTP
  // ---------------------------------------------------------------------------
  async resendOtp(tempToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken);
      if (payload.purpose !== '2fa') throw new Error();
    } catch {
      throw new UnauthorizedException('Token temporaire invalide ou expiré');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user?.phone)
      throw new BadRequestException('Numéro de téléphone non configuré');

    const { code } = await this.smsService.sendOtp(user.phone);
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    await this.prisma.otpCode.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        code: codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return { message: 'Nouveau code envoyé par SMS' };
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

  private async generateCarypassId(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await this.prisma.$transaction(async (tx) => {
      const setting = await tx.systemSetting.findUnique({
        where: { key: 'carypass_id_counter' },
      });
      const counter = parseInt(setting?.value || '0') + 1;
      await tx.systemSetting.upsert({
        where: { key: 'carypass_id_counter' },
        update: { value: counter.toString() },
        create: {
          key: 'carypass_id_counter',
          value: counter.toString(),
          description: 'Compteur CaryPass ID',
        },
      });
      return counter;
    });
    return `CP-${year}-${result.toString().padStart(5, '0')}`;
  }
}
