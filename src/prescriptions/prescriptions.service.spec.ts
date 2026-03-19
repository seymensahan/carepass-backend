import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prisma: any;

  const mockPrisma = {
    prescription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    prescriptionItem: { deleteMany: jest.fn() },
    doctor: { findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    consultation: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const doctorUser = { id: 'user-d1', role: 'doctor' };
  const patientUser = { id: 'user-p1', role: 'patient' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return prescriptions for doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.prescription.findMany.mockResolvedValue([{ id: 'presc-1' }]);
      prisma.prescription.count.mockResolvedValue(1);

      const result = await service.findAll({}, doctorUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should return prescriptions for patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.prescription.findMany.mockResolvedValue([]);
      prisma.prescription.count.mockResolvedValue(0);

      const result = await service.findAll({}, patientUser);

      expect(result.data).toHaveLength(0);
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findAll({}, doctorUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return prescription by id', async () => {
      prisma.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        items: [{ medication: 'Amoxicilline' }],
      });

      const result = await service.findOne('presc-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('presc-1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.prescription.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a prescription', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.consultation.findUnique.mockResolvedValue({ id: 'cons-1' });
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.prescription.create.mockResolvedValue({
        id: 'presc-1',
        items: [{ medication: 'Amoxicilline' }],
      });

      const result = await service.create('doc-1', {
        consultationId: 'cons-1',
        patientId: 'pat-1',
        items: [{ medication: 'Amoxicilline', dosage: '500mg', frequency: '3x/jour', duration: '7 jours' }],
      } as any);

      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if doctor not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.create('bad-doc', {
          consultationId: 'cons-1',
          patientId: 'pat-1',
          items: [],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if consultation not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.consultation.findUnique.mockResolvedValue(null);

      await expect(
        service.create('doc-1', {
          consultationId: 'bad-cons',
          patientId: 'pat-1',
          items: [],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update prescription by creating doctor', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'presc-1', doctorId: 'doc-1' });
      prisma.prescription.update.mockResolvedValue({ id: 'presc-1', notes: 'Updated' });

      const result = await service.update('presc-1', 'doc-1', { notes: 'Updated' } as any);

      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException if not creating doctor', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'presc-1', doctorId: 'doc-1' });

      await expect(
        service.update('presc-1', 'doc-other', { notes: 'Updated' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for invalid prescription', async () => {
      prisma.prescription.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', 'doc-1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete prescription by creating doctor', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'presc-1', doctorId: 'doc-1' });
      prisma.prescription.delete.mockResolvedValue({});

      const result = await service.remove('presc-1', 'doc-1');

      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException if not creating doctor', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'presc-1', doctorId: 'doc-1' });

      await expect(service.remove('presc-1', 'doc-other')).rejects.toThrow(ForbiddenException);
    });
  });
});
