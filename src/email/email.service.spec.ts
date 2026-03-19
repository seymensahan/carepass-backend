import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        FRONTEND_URL: 'http://localhost:3000',
        EMAIL_FROM: 'CAREPASS <noreply@carepass.cm>',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  describe('sendPasswordResetEmail', () => {
    it('should log email when no API key (mock mode)', async () => {
      // No RESEND_API_KEY set, so it should just log
      await expect(
        service.sendPasswordResetEmail('test@example.com', 'Jean', 'reset-token-123'),
      ).resolves.not.toThrow();
    });
  });

  describe('sendEmailVerification', () => {
    it('should log email verification in mock mode', async () => {
      await expect(
        service.sendEmailVerification('test@example.com', 'Jean', 'verify-token-123'),
      ).resolves.not.toThrow();
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should log welcome email in mock mode', async () => {
      await expect(
        service.sendWelcomeEmail('test@example.com', 'Jean'),
      ).resolves.not.toThrow();
    });
  });
});
