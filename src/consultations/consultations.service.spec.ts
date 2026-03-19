import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConsultationsService } from './consultations.service';

describe('ConsultationsService', () => {
  let service: ConsultationsService;
  let prisma: any;

  const mockPrisma = {
    consultation: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    doctor: {
      findUnique: jest.fn(),
    },
    patient: {
      findUnique: jest.fn(),
    },
    prescription: {
      create: jest.fn(),
    },
  };

  const doctorUser = { id: 'user-d1', role: 'doctor', email: 'doc@test.com' };
  const patientUser = { id: 'user-p1', role: 'patient', email: 'pat@test.com' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should filter by doctorId for doctor role', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.consultation.findMany.mockResolvedValue([]);
      prisma.consultation.count.mockResolvedValue(0);

      const result = await service.findAll({}, doctorUser);

      expect(prisma.doctor.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-d1' } });
      expect(result).toBeDefined();
    });

    it('should filter by patientId for patient role', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.consultation.findMany.mockResolvedValue([]);
      prisma.consultation.count.mockResolvedValue(0);

      const result = await service.findAll({}, patientUser);

      expect(prisma.patient.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-p1' } });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findAll({}, doctorUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return consultation with relations', async () => {
      const mockConsultation = {
        id: 'cons-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        motif: 'Check-up',
        patient: { user: { firstName: 'Jean', lastName: 'Dupont' } },
        doctor: { user: { firstName: 'Dr', lastName: 'Smith' } },
        prescriptions: [],
      };
      prisma.consultation.findUnique.mockResolvedValue(mockConsultation);

      const result = await service.findOne('cons-1');

      expect(result).toBeDefined();
      expect(result.data.id).toBe('cons-1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.consultation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
