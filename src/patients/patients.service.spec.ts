import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PatientsService } from './patients.service';

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: any;

  const mockPrisma = {
    patient: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    doctor: { findUnique: jest.fn() },
    institution: { findUnique: jest.fn() },
    accessGrant: { findFirst: jest.fn() },
    consultation: { findMany: jest.fn() },
    prescription: { findMany: jest.fn() },
    labResult: { findMany: jest.fn() },
    vaccination: { findMany: jest.fn(), count: jest.fn() },
    allergy: { findMany: jest.fn() },
    medicalCondition: { findMany: jest.fn() },
    systemSetting: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const patientUser = { id: 'user-p1', role: 'patient' };
  const doctorUser = { id: 'user-d1', role: 'doctor' };
  const adminUser = { id: 'user-a1', role: 'super_admin' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return paginated patients for super_admin', async () => {
      prisma.patient.findMany.mockResolvedValue([{ id: 'pat-1' }]);
      prisma.patient.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, adminUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by doctor access grants for doctor role', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.patient.findMany.mockResolvedValue([]);
      prisma.patient.count.mockResolvedValue(0);

      const result = await service.findAll({}, doctorUser);

      expect(result.data).toHaveLength(0);
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findAll({}, doctorUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return patient for own profile', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 'pat-1',
        userId: 'user-p1',
        emergencyContacts: [],
        children: [],
        user: { id: 'user-p1', firstName: 'Jean', lastName: 'Test' },
      });

      const result = await service.findOne('pat-1', patientUser);

      expect(result.id).toBe('pat-1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id', patientUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for unauthorized access', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 'pat-1',
        userId: 'user-other',
      });
      // Doctor without grant
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.accessGrant.findFirst.mockResolvedValue(null);

      await expect(service.findOne('pat-1', doctorUser)).rejects.toThrow(ForbiddenException);
    });

    it('should allow super_admin access', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 'pat-1',
        userId: 'user-other',
        emergencyContacts: [],
        children: [],
        user: {},
      });

      const result = await service.findOne('pat-1', adminUser);

      expect(result.id).toBe('pat-1');
    });
  });

  describe('findByCarepassId', () => {
    it('should return patient by carepass id', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1', carepassId: 'CP-2026-00001' });

      const result = await service.findByCarepassId('CP-2026-00001');

      expect(result.carepassId).toBe('CP-2026-00001');
    });

    it('should throw NotFoundException for invalid carepass id', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.findByCarepassId('CP-INVALID')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a patient profile', async () => {
      prisma.patient.findUnique.mockResolvedValue(null); // no existing
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          systemSetting: {
            findUnique: jest.fn().mockResolvedValue({ value: '5' }),
            upsert: jest.fn(),
          },
        });
      });
      prisma.patient.create.mockResolvedValue({
        id: 'pat-1',
        userId: 'user-p1',
        carepassId: 'CP-2026-00006',
      });

      const result = await service.create('user-p1', {
        dateOfBirth: '1990-01-01',
        gender: 'M',
      } as any);

      expect(result.id).toBe('pat-1');
    });

    it('should throw ConflictException if profile already exists', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('user-p1', { dateOfBirth: '1990-01-01', gender: 'M' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update own patient profile', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1', userId: 'user-p1' });
      prisma.patient.update.mockResolvedValue({ id: 'pat-1', city: 'Douala' });

      const result = await service.update('pat-1', 'user-p1', { city: 'Douala' } as any);

      expect(result.city).toBe('Douala');
    });

    it('should throw NotFoundException for invalid patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', 'user-p1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not own profile', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1', userId: 'user-other' });

      await expect(service.update('pat-1', 'user-p1', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMedicalHistory', () => {
    it('should return medical history for own profile', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1', userId: 'user-p1' });
      prisma.consultation.findMany.mockResolvedValue([]);
      prisma.prescription.findMany.mockResolvedValue([]);
      prisma.labResult.findMany.mockResolvedValue([]);
      prisma.vaccination.findMany.mockResolvedValue([]);
      prisma.allergy.findMany.mockResolvedValue([]);
      prisma.medicalCondition.findMany.mockResolvedValue([]);

      const result = await service.getMedicalHistory('pat-1', patientUser);

      expect(result).toHaveProperty('consultations');
      expect(result).toHaveProperty('prescriptions');
      expect(result).toHaveProperty('vaccinations');
      expect(result).toHaveProperty('allergies');
      expect(result).toHaveProperty('conditions');
    });

    it('should throw NotFoundException for invalid patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.getMedicalHistory('bad-id', patientUser)).rejects.toThrow(NotFoundException);
    });
  });
});
