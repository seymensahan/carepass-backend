import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;

  const mockPrisma = {
    plan: { findUnique: jest.fn(), findMany: jest.fn() },
    subscription: { findFirst: jest.fn(), create: jest.fn() },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        PAWAPAY_API_URL: 'https://api.sandbox.pawapay.io',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get(PrismaClient);
  });

  describe('initiatePayment', () => {
    it('should simulate payment when no API key', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', isActive: true, priceMonthly: 5000 });
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({ id: 'pay-1', userId: 'user-1' });
      prisma.payment.update.mockResolvedValue({});
      prisma.subscription.create.mockResolvedValue({ id: 'sub-1' });

      const result = await service.initiatePayment('user-1', {
        planId: 'plan-1',
        phoneNumber: '+237690000000',
        period: 'monthly',
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('completed');
    });

    it('should throw NotFoundException for invalid plan', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.initiatePayment('user-1', {
          planId: 'bad-plan',
          phoneNumber: '+237690000000',
          period: 'monthly',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if active subscription exists', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', isActive: true, priceMonthly: 5000 });
      prisma.subscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'active' });

      await expect(
        service.initiatePayment('user-1', {
          planId: 'plan-1',
          phoneNumber: '+237690000000',
          period: 'monthly',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleWebhook', () => {
    it('should handle COMPLETED webhook', async () => {
      prisma.payment.findUnique
        .mockResolvedValueOnce({ id: 'pay-1', userId: 'user-1', externalId: 'ext-1' })
        .mockResolvedValueOnce({ id: 'pay-1', userId: 'user-1', subscriptionId: null });
      prisma.payment.update.mockResolvedValue({});
      prisma.plan.findMany.mockResolvedValue([{ id: 'plan-1' }]);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-1' });

      const result = await service.handleWebhook({ depositId: 'ext-1', status: 'COMPLETED' });

      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException if no depositId', async () => {
      await expect(service.handleWebhook({})).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for unknown payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.handleWebhook({ depositId: 'unknown', status: 'COMPLETED' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPaymentHistory', () => {
    it('should return paginated payment history', async () => {
      prisma.payment.findMany.mockResolvedValue([{ id: 'pay-1' }]);
      prisma.payment.count.mockResolvedValue(1);

      const result = await service.getPaymentHistory('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'completed' });

      const result = await service.getPaymentStatus('pay-1');

      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException for invalid payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.getPaymentStatus('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
