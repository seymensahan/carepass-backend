import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { EmailService } from '../email/email.service';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let emailService: any;

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    patient: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    systemSetting: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((fn) => {
      if (typeof fn === 'function') return fn(mockPrisma);
      return Promise.all(fn);
    }),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
    verify: jest.fn(),
  };

  const mockEmailService = {
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
        FRONTEND_URL: 'http://localhost:3000',
      };
      return config[key] || defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      throw new Error(`Missing ${key}`);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaClient);
    jwtService = module.get(JwtService);
    emailService = module.get(EmailService);
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'Jean',
      lastName: 'Dupont',
      role: 'patient' as const,
      phone: '+237600000000',
    };

    it('should register a new patient successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: registerDto.email,
        role: 'patient',
        firstName: 'Jean',
        lastName: 'Dupont',
        phone: '+237600000000',
      });
      prisma.systemSetting.findUnique.mockResolvedValue({ value: '5' });
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.patient.create.mockResolvedValue({ id: 'patient-1', carepassId: 'CP-2026-00006' });
      prisma.patient.findUnique.mockResolvedValue({ gender: null, dateOfBirth: null, bloodGroup: null });
      prisma.emailVerificationToken.create.mockResolvedValue({});

      const result = await service.register(registerDto);

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(result.user.email).toBe(registerDto.email);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.patient.create).toHaveBeenCalled();
      expect(emailService.sendEmailVerification).toHaveBeenCalled();
      expect(emailService.sendWelcomeEmail).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const loginDto = { email: 'test@example.com', password: 'Password123!' };

    it('should login successfully with correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        passwordHash: 'hashed-password',
        role: 'patient',
        firstName: 'Jean',
        lastName: 'Dupont',
        phone: null,
        isActive: true,
      });
      prisma.patient.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('mock-token');
      expect(result.user.email).toBe(loginDto.email);
    });

    it('should throw UnauthorizedException for wrong email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        passwordHash: 'hashed-password',
        isActive: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        passwordHash: 'hashed-password',
        isActive: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('should send reset email for existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Jean',
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({});
      prisma.passwordResetToken.create.mockResolvedValue({});

      const result = await service.forgotPassword({ email: 'test@example.com' });

      expect(result.message).toContain('lien de réinitialisation');
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should return same message for non-existing user (prevent enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'nonexistent@example.com' });

      expect(result.message).toContain('lien de réinitialisation');
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException for invalid token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bad-token', newPassword: 'NewPass123!' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens for valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com', role: 'patient' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'patient',
        isActive: true,
      });

      const result = await service.refreshToken({ refreshToken: 'valid-refresh-token' });

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        service.refreshToken({ refreshToken: 'invalid-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should return success message', async () => {
      const result = await service.logout();
      expect(result.message).toBe('Déconnexion réussie');
    });
  });
});
