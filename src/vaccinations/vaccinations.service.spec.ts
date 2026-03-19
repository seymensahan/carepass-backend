import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { VaccinationsService } from './vaccinations.service';

describe('VaccinationsService', () => {
  let service: VaccinationsService;
  let prisma: any;

  const mockPrisma = {
    vaccination: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    patient: { findUnique: jest.fn() },
    doctor: { findUnique: jest.fn() },
    accessGrant: { findMany: jest.fn() },
  };

  const patientUser = { id: 'user-p1', role: 'patient' };
  const adminUser = { id: 'user-a1', role: 'super_admin' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccinationsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VaccinationsService>(VaccinationsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return paginated vaccinations for patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1', children: [] });
      prisma.vaccination.findMany.mockResolvedValue([{ id: 'vac-1' }]);
      prisma.vaccination.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, patientUser);

      expect(result.data).toHaveLength(1);
    });

    it('should return all vaccinations for super_admin', async () => {
      prisma.vaccination.findMany.mockResolvedValue([{ id: 'vac-1' }, { id: 'vac-2' }]);
      prisma.vaccination.count.mockResolvedValue(2);

      const result = await service.findAll({}, adminUser);

      expect(result.data).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return vaccination by id', async () => {
      prisma.vaccination.findUnique.mockResolvedValue({ id: 'vac-1', vaccineName: 'BCG' });

      const result = await service.findOne('vac-1');

      expect(result.id).toBe('vac-1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.vaccination.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a vaccination', async () => {
      prisma.vaccination.create.mockResolvedValue({
        id: 'vac-1',
        vaccineName: 'BCG',
        patientId: 'pat-1',
      });

      const result = await service.create({
        patientId: 'pat-1',
        vaccineName: 'BCG',
        date: '2026-03-15',
      } as any);

      expect(result.id).toBe('vac-1');
    });
  });

  describe('update', () => {
    it('should update a vaccination', async () => {
      prisma.vaccination.findUnique.mockResolvedValue({ id: 'vac-1' });
      prisma.vaccination.update.mockResolvedValue({ id: 'vac-1', status: 'completed' });

      const result = await service.update('vac-1', { status: 'completed' } as any);

      expect(result.status).toBe('completed');
    });

    it('should throw NotFoundException for invalid vaccination', async () => {
      prisma.vaccination.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a vaccination', async () => {
      prisma.vaccination.findUnique.mockResolvedValue({ id: 'vac-1' });
      prisma.vaccination.delete.mockResolvedValue({});

      const result = await service.remove('vac-1');

      expect(result.message).toContain('supprimee');
    });

    it('should throw NotFoundException for invalid vaccination', async () => {
      prisma.vaccination.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
