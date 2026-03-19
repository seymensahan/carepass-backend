import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { HospitalisationsService } from './hospitalisations.service';

describe('HospitalisationsService', () => {
  let service: HospitalisationsService;
  let prisma: any;

  const mockPrisma = {
    doctor: { findUnique: jest.fn() },
    hospitalisation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    hospitalisationVital: { create: jest.fn() },
    hospitalisationMedication: { create: jest.fn() },
    evolutionNote: { create: jest.fn() },
  };

  const doctorUser = { id: 'user-d1' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HospitalisationsService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HospitalisationsService>(HospitalisationsService);
    prisma = module.get(PrismaClient);
  });

  describe('create', () => {
    it('should create a hospitalisation', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.create.mockResolvedValue({
        id: 'hosp-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        reason: 'Crise',
      });

      const result = await service.create(
        { patientId: 'pat-1', admissionDate: '2026-03-15', reason: 'Crise' },
        doctorUser,
      );

      expect(result.id).toBe('hosp-1');
      expect(prisma.hospitalisation.create).toHaveBeenCalled();
    });

    it('should throw if doctor profile not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ patientId: 'pat-1', admissionDate: '2026-03-15', reason: 'Test' }, doctorUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all hospitalisations for the doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findMany.mockResolvedValue([
        { id: 'hosp-1', status: 'en_cours' },
        { id: 'hosp-2', status: 'terminee' },
      ]);

      const result = await service.findAll(doctorUser);

      expect(result).toHaveLength(2);
    });
  });

  describe('findActive', () => {
    it('should return only active hospitalisations', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findMany.mockResolvedValue([
        { id: 'hosp-1', status: 'en_cours' },
      ]);

      const result = await service.findActive(doctorUser);

      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return hospitalisation detail', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue({
        id: 'hosp-1',
        doctorId: 'doc-1',
        patient: { user: { firstName: 'Jean', lastName: 'Test' } },
        doctor: { user: { firstName: 'Dr', lastName: 'Test' } },
        vitalSigns: [],
        medications: [],
        evolutionNotes: [],
      });

      const result = await service.findOne('hosp-1', doctorUser);

      expect(result.id).toBe('hosp-1');
    });

    it('should throw NotFoundException for invalid id', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id', doctorUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not the doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue({
        id: 'hosp-1',
        doctorId: 'doc-other',
      });

      await expect(service.findOne('hosp-1', doctorUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('discharge', () => {
    it('should discharge a patient', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue({ id: 'hosp-1', doctorId: 'doc-1' });
      prisma.hospitalisation.update.mockResolvedValue({ id: 'hosp-1', status: 'terminee' });

      const result = await service.discharge('hosp-1', doctorUser);

      expect(result.status).toBe('terminee');
    });

    it('should throw ForbiddenException for unauthorized discharge', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue({ id: 'hosp-1', doctorId: 'doc-other' });

      await expect(service.discharge('hosp-1', doctorUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addVital', () => {
    it('should add vital signs', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue({
        id: 'hosp-1',
        doctorId: 'doc-1',
        patient: {},
        doctor: { user: {} },
        vitalSigns: [],
        medications: [],
        evolutionNotes: [],
      });
      prisma.hospitalisationVital.create.mockResolvedValue({
        id: 'vital-1',
        temperature: 37.5,
      });

      const result = await service.addVital('hosp-1', { temperature: 37.5, spO2: 96 }, doctorUser);

      expect(result.temperature).toBe(37.5);
    });
  });

  describe('addMedication', () => {
    it('should add a medication', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue({
        id: 'hosp-1',
        doctorId: 'doc-1',
        patient: {},
        doctor: { user: {} },
        vitalSigns: [],
        medications: [],
        evolutionNotes: [],
      });
      prisma.hospitalisationMedication.create.mockResolvedValue({
        id: 'med-1',
        medication: 'Paracétamol',
      });

      const result = await service.addMedication(
        'hosp-1',
        { medication: 'Paracétamol', dosage: '1g', route: 'PO' },
        doctorUser,
      );

      expect(result.medication).toBe('Paracétamol');
    });
  });

  describe('addEvolutionNote', () => {
    it('should add an evolution note', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.findUnique.mockResolvedValue({
        id: 'hosp-1',
        doctorId: 'doc-1',
        patient: {},
        doctor: { user: { firstName: 'Jean', lastName: 'Doc' } },
        vitalSigns: [],
        medications: [],
        evolutionNotes: [],
      });
      prisma.evolutionNote.create.mockResolvedValue({
        id: 'note-1',
        content: 'Amélioration',
        doctorName: 'Dr. Jean Doc',
      });

      const result = await service.addEvolutionNote('hosp-1', { content: 'Amélioration' }, doctorUser);

      expect(result.content).toBe('Amélioration');
      expect(result.doctorName).toBe('Dr. Jean Doc');
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      prisma.hospitalisation.count
        .mockResolvedValueOnce(3) // active
        .mockResolvedValueOnce(1); // today
      prisma.hospitalisation.findMany.mockResolvedValue([
        { admissionDate: new Date('2026-03-01'), dischargeDate: new Date('2026-03-06') },
        { admissionDate: new Date('2026-03-05'), dischargeDate: new Date('2026-03-08') },
      ]);

      const result = await service.getStats(doctorUser);

      expect(result.activeCount).toBe(3);
      expect(result.todayAdmissions).toBe(1);
      expect(result.totalCompleted).toBe(2);
      expect(result.avgStayDays).toBeGreaterThan(0);
    });
  });
});
