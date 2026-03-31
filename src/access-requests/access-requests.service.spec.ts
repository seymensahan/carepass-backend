import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AccessRequestsService } from './access-requests.service';

describe('AccessRequestsService', () => {
  let service: AccessRequestsService;
  let prisma: any;

  const mockPrisma = {
    accessRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    accessGrant: { create: jest.fn() },
    doctor: { findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessRequestsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccessRequestsService>(AccessRequestsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return requests for doctor role', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.accessRequest.findMany.mockResolvedValue([{ id: 'req-1' }]);
      prisma.accessRequest.count.mockResolvedValue(1);

      const result = await service.findAll('user-d1', 'doctor', {});

      expect(result.data).toHaveLength(1);
    });

    it('should return requests for patient role', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.accessRequest.findMany.mockResolvedValue([]);
      prisma.accessRequest.count.mockResolvedValue(0);

      const result = await service.findAll('user-p1', 'patient', {});

      expect(result.data).toHaveLength(0);
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findAll('user-d1', 'doctor', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return request by id', async () => {
      prisma.accessRequest.findUnique.mockResolvedValue({ id: 'req-1', status: 'pending' });

      const result = await service.findOne('req-1');

      expect(result.id).toBe('req-1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.accessRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create an access request', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.accessRequest.findFirst.mockResolvedValue(null);
      prisma.accessRequest.create.mockResolvedValue({
        id: 'req-1',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        status: 'pending',
      });

      const result = await service.create('user-d1', {
        patientCarepassId: 'CP-2026-00001',
        reason: 'Suivi medical',
      });

      expect(result.id).toBe('req-1');
    });

    it('should throw NotFoundException if doctor not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-d1', { patientCarepassId: 'CP-2026-00001', reason: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if patient not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-d1', { patientCarepassId: 'CP-INVALID', reason: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if pending request already exists', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.accessRequest.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('user-d1', { patientCarepassId: 'CP-2026-00001', reason: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('approve', () => {
    it('should approve a pending request', async () => {
      prisma.accessRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'pending',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        patient: {
          userId: 'user-p1',
          user: { firstName: 'Jean', lastName: 'Test' },
        },
        doctor: { userId: 'user-d1' },
      });
      prisma.$transaction.mockResolvedValue([
        { id: 'req-1', status: 'approved' },
        {},
        {},
      ]);

      const result = await service.approve('req-1', 'user-p1');

      expect(result.status).toBe('approved');
    });

    it('should throw ForbiddenException if not the patient', async () => {
      prisma.accessRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'pending',
        patient: { userId: 'user-other', user: {} },
        doctor: {},
      });

      await expect(service.approve('req-1', 'user-p1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if already processed', async () => {
      prisma.accessRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'approved',
        patient: { userId: 'user-p1', user: {} },
        doctor: {},
      });

      await expect(service.approve('req-1', 'user-p1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deny', () => {
    it('should deny a pending request', async () => {
      prisma.accessRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'pending',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        patient: {
          userId: 'user-p1',
          user: { firstName: 'Jean', lastName: 'Test' },
        },
        doctor: { userId: 'user-d1' },
      });
      prisma.$transaction.mockResolvedValue([
        { id: 'req-1', status: 'denied' },
        {},
      ]);

      const result = await service.deny('req-1', 'user-p1');

      expect(result.status).toBe('denied');
    });

    it('should throw NotFoundException for invalid request', async () => {
      prisma.accessRequest.findUnique.mockResolvedValue(null);

      await expect(service.deny('bad-id', 'user-p1')).rejects.toThrow(NotFoundException);
    });
  });
});
