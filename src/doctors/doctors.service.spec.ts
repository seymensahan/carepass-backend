import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DoctorsService } from './doctors.service';

describe('DoctorsService', () => {
  let service: DoctorsService;
  let prisma: any;

  const mockPrisma = {
    doctor: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    institution: { findUnique: jest.fn() },
    accessGrant: { findMany: jest.fn(), count: jest.fn() },
    consultation: { count: jest.fn() },
    accessRequest: { count: jest.fn() },
    doctorInstitution: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DoctorsService>(DoctorsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return paginated doctors', async () => {
      prisma.doctor.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      prisma.doctor.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return doctor by id', async () => {
      prisma.doctor.findUnique.mockResolvedValue({
        id: 'doc-1',
        specialty: 'Cardiologie',
        user: { firstName: 'Jean', lastName: 'Doc' },
      });

      const result = await service.findOne('doc-1');

      expect(result.specialty).toBe('Cardiologie');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a doctor profile', async () => {
      prisma.doctor.findUnique
        .mockResolvedValueOnce(null) // no existing profile
        .mockResolvedValueOnce(null); // no existing license
      prisma.doctor.create.mockResolvedValue({
        id: 'doc-1',
        specialty: 'Cardiologie',
        licenseNumber: 'LIC-001',
      });

      const result = await service.create('user-d1', {
        specialty: 'Cardiologie',
        licenseNumber: 'LIC-001',
      } as any);

      expect(result.id).toBe('doc-1');
    });

    it('should throw ConflictException if profile already exists', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('user-d1', { specialty: 'Cardiologie', licenseNumber: 'LIC-001' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate license number', async () => {
      prisma.doctor.findUnique
        .mockResolvedValueOnce(null) // no existing profile
        .mockResolvedValueOnce({ id: 'other-doc' }); // license exists

      await expect(
        service.create('user-d1', { specialty: 'Cardiologie', licenseNumber: 'LIC-TAKEN' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update own doctor profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-d1',
        licenseNumber: 'LIC-001',
      });
      prisma.doctor.update.mockResolvedValue({ id: 'doc-1', bio: 'Updated bio' });

      const result = await service.update('doc-1', 'user-d1', { bio: 'Updated bio' } as any);

      expect(result.bio).toBe('Updated bio');
    });

    it('should throw ForbiddenException if not own profile', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-other' });

      await expect(
        service.update('doc-1', 'user-d1', { bio: 'Test' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for invalid doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', 'user-d1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('verify', () => {
    it('should verify a doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1', isVerified: false });
      prisma.doctor.update.mockResolvedValue({ id: 'doc-1', isVerified: true });

      const result = await service.verify('doc-1', 'admin-1');

      expect(result.isVerified).toBe(true);
    });

    it('should throw ConflictException if already verified', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1', isVerified: true });

      await expect(service.verify('doc-1', 'admin-1')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for invalid doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.verify('bad-id', 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return doctor statistics', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.accessGrant.count.mockResolvedValue(10);
      prisma.consultation.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(5); // this month
      prisma.accessRequest.count.mockResolvedValue(2);

      const result = await service.getStats('doc-1');

      expect(result.totalPatients).toBe(10);
      expect(result.totalConsultations).toBe(50);
      expect(result.consultationsThisMonth).toBe(5);
      expect(result.pendingRequests).toBe(2);
    });

    it('should throw NotFoundException for invalid doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getStats('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPatients', () => {
    it('should return paginated patients for doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.accessGrant.findMany.mockResolvedValue([
        {
          id: 'grant-1',
          grantedAt: new Date(),
          scope: 'full',
          patient: { id: 'pat-1', user: { firstName: 'Jean' } },
        },
      ]);
      prisma.accessGrant.count.mockResolvedValue(1);

      const result = await service.getPatients('doc-1', {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should throw NotFoundException for invalid doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getPatients('bad-id', {})).rejects.toThrow(NotFoundException);
    });
  });
});
