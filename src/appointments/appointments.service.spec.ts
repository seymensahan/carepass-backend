import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: any;

  const mockPrisma = {
    appointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    doctor: { findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
  };

  const doctorUser = { id: 'user-d1', role: 'doctor' };
  const patientUser = { id: 'user-p1', role: 'patient' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get(PrismaClient);
  });

  describe('findAll', () => {
    it('should return paginated appointments for doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.appointment.findMany.mockResolvedValue([{ id: 'apt-1' }]);
      prisma.appointment.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, doctorUser);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findAll({}, doctorUser)).rejects.toThrow(NotFoundException);
    });

    it('should filter by patient profile for patient role', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.appointment.count.mockResolvedValue(0);

      const result = await service.findAll({}, patientUser);

      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('should return appointment by id', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        patient: { user: {} },
        doctor: { user: {} },
      });

      const result = await service.findOne('apt-1');

      expect(result.id).toBe('apt-1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create appointment as doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.appointment.create.mockResolvedValue({
        id: 'apt-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
      });

      const result = await service.create('user-d1', 'doctor', {
        patientId: 'pat-1',
        date: '2026-03-20',
        type: 'consultation',
        reason: 'Checkup',
      } as any);

      expect(result.id).toBe('apt-1');
    });

    it('should create appointment as patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.appointment.create.mockResolvedValue({
        id: 'apt-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
      });

      const result = await service.create('user-p1', 'patient', {
        doctorId: 'doc-1',
        date: '2026-03-20',
        type: 'consultation',
        reason: 'Checkup',
      } as any);

      expect(result.id).toBe('apt-1');
    });

    it('should throw BadRequestException if patient missing patientId', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });

      await expect(
        service.create('user-p1', 'patient', {
          date: '2026-03-20',
          type: 'consultation',
          reason: 'Checkup',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-d1', 'doctor', {
          patientId: 'pat-1',
          date: '2026-03-20',
          type: 'consultation',
          reason: 'Checkup',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update status with valid transition', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        status: 'scheduled',
        patient: { user: { id: 'user-p1', firstName: 'Jean', lastName: 'Test' } },
        doctor: { user: { id: 'user-d1', firstName: 'Dr', lastName: 'Doc' } },
      });
      prisma.appointment.update.mockResolvedValue({
        id: 'apt-1',
        status: 'confirmed',
      });
      prisma.notification.create.mockResolvedValue({});

      const result = await service.updateStatus('apt-1', 'user-d1', { status: 'confirmed' } as any);

      expect(result.status).toBe('confirmed');
    });

    it('should throw BadRequestException for invalid transition', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        status: 'completed',
        patient: { user: {} },
        doctor: { user: {} },
      });

      await expect(
        service.updateStatus('apt-1', 'user-d1', { status: 'confirmed' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for invalid appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('bad-id', 'user-d1', { status: 'confirmed' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete an appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'apt-1' });
      prisma.appointment.delete.mockResolvedValue({});

      const result = await service.remove('apt-1', 'user-d1');

      expect(result.message).toContain('supprimé');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id', 'user-d1')).rejects.toThrow(NotFoundException);
    });
  });
});
