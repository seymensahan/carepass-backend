import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MedicalConditionsService } from './medical-conditions.service';

describe('MedicalConditionsService', () => {
  let service: MedicalConditionsService;
  let prisma: any;

  const mockPrisma = {
    medicalCondition: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalConditionsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MedicalConditionsService>(MedicalConditionsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return conditions for a patient', async () => {
      prisma.medicalCondition.findMany.mockResolvedValue([
        { id: 'cond-1', name: 'Diabete' },
      ]);

      const result = await service.findAll('pat-1');

      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return condition by id', async () => {
      prisma.medicalCondition.findUnique.mockResolvedValue({ id: 'cond-1', name: 'Diabete' });

      const result = await service.findOne('cond-1');

      expect(result.name).toBe('Diabete');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.medicalCondition.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a medical condition', async () => {
      prisma.medicalCondition.create.mockResolvedValue({
        id: 'cond-1',
        name: 'Hypertension',
        patientId: 'pat-1',
      });

      const result = await service.create({
        patientId: 'pat-1',
        name: 'Hypertension',
        status: 'active',
      } as any);

      expect(result.name).toBe('Hypertension');
    });
  });

  describe('update', () => {
    it('should update a condition', async () => {
      prisma.medicalCondition.findUnique.mockResolvedValue({ id: 'cond-1' });
      prisma.medicalCondition.update.mockResolvedValue({ id: 'cond-1', status: 'resolved' });

      const result = await service.update('cond-1', { status: 'resolved' } as any);

      expect(result.status).toBe('resolved');
    });

    it('should throw NotFoundException for invalid condition', async () => {
      prisma.medicalCondition.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a condition', async () => {
      prisma.medicalCondition.findUnique.mockResolvedValue({ id: 'cond-1' });
      prisma.medicalCondition.delete.mockResolvedValue({});

      const result = await service.remove('cond-1');

      expect(result.message).toContain('supprimee');
    });

    it('should throw NotFoundException for invalid condition', async () => {
      prisma.medicalCondition.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
