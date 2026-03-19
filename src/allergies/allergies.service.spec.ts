import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AllergiesService } from './allergies.service';

describe('AllergiesService', () => {
  let service: AllergiesService;
  let prisma: any;

  const mockPrisma = {
    allergy: {
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
        AllergiesService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AllergiesService>(AllergiesService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return allergies for a patient', async () => {
      prisma.allergy.findMany.mockResolvedValue([
        { id: 'all-1', name: 'Penicilline' },
        { id: 'all-2', name: 'Arachide' },
      ]);

      const result = await service.findAll('pat-1');

      expect(result.data).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return allergy by id', async () => {
      prisma.allergy.findUnique.mockResolvedValue({ id: 'all-1', name: 'Penicilline' });

      const result = await service.findOne('all-1');

      expect(result.name).toBe('Penicilline');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.allergy.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create an allergy', async () => {
      prisma.allergy.create.mockResolvedValue({
        id: 'all-1',
        name: 'Penicilline',
        severity: 'high',
        patientId: 'pat-1',
      });

      const result = await service.create({
        patientId: 'pat-1',
        name: 'Penicilline',
        severity: 'high',
      } as any);

      expect(result.name).toBe('Penicilline');
    });
  });

  describe('update', () => {
    it('should update an allergy', async () => {
      prisma.allergy.findUnique.mockResolvedValue({ id: 'all-1' });
      prisma.allergy.update.mockResolvedValue({ id: 'all-1', severity: 'low' });

      const result = await service.update('all-1', { severity: 'low' } as any);

      expect(result.severity).toBe('low');
    });

    it('should throw NotFoundException for invalid allergy', async () => {
      prisma.allergy.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete an allergy', async () => {
      prisma.allergy.findUnique.mockResolvedValue({ id: 'all-1' });
      prisma.allergy.delete.mockResolvedValue({});

      const result = await service.remove('all-1');

      expect(result.message).toContain('supprimee');
    });

    it('should throw NotFoundException for invalid allergy', async () => {
      prisma.allergy.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
