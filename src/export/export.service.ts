import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ExportFilterDto } from './dto/export-filter.dto';
import { format as csvFormat } from '@fast-csv/format';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // CSV helper
  // ---------------------------------------------------------------------------
  private generateCsv(rows: Record<string, any>[], columns?: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      if (rows.length === 0) {
        resolve('');
        return;
      }
      const headers = columns || Object.keys(rows[0]);
      const chunks: string[] = [];
      const stream = csvFormat({ headers: true });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
      stream.on('end', () => resolve(chunks.join('')));
      stream.on('error', reject);
      for (const row of rows) {
        const flat: Record<string, string> = {};
        for (const h of headers) {
          const val = row[h];
          flat[h] = val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
        stream.write(flat);
      }
      stream.end();
    });
  }

  // ---------------------------------------------------------------------------
  // PDF helpers
  // ---------------------------------------------------------------------------
  private createPdfBuffer(buildFn: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      buildFn(doc);
      doc.end();
    });
  }

  private addPdfHeader(doc: PDFKit.PDFDocument, title: string) {
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('CARYPASS', { align: 'center' })
      .moveDown(0.3)
      .fontSize(10)
      .font('Helvetica')
      .text('Plateforme de sante numerique', { align: 'center' })
      .moveDown(0.5)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke()
      .moveDown(0.5)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(title)
      .moveDown(0.5)
      .fontSize(10)
      .font('Helvetica')
      .text(`Genere le : ${new Date().toLocaleDateString('fr-FR')}`)
      .moveDown(1);
  }

  private addPdfTable(doc: PDFKit.PDFDocument, headers: string[], rows: string[][], colWidths?: number[]) {
    const tableLeft = 50;
    const defaultColWidth = (545 - 50) / headers.length;
    const widths = colWidths || headers.map(() => defaultColWidth);
    const rowHeight = 20;

    // Header row
    let x = tableLeft;
    doc.font('Helvetica-Bold').fontSize(9);
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x, doc.y, { width: widths[i], continued: false });
      x += widths[i];
    }
    doc.moveDown(0.3);
    doc.moveTo(tableLeft, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    // Data rows
    doc.font('Helvetica').fontSize(8);
    for (const row of rows) {
      if (doc.y > 750) {
        doc.addPage();
        this.addPdfHeader(doc, '(suite)');
      }
      const startY = doc.y;
      x = tableLeft;
      for (let i = 0; i < row.length; i++) {
        doc.text(row[i] || '', x, startY, { width: widths[i], lineBreak: false });
        x += widths[i];
      }
      doc.moveDown(0.5);
    }
  }

  // ---------------------------------------------------------------------------
  // EXPORT PATIENTS
  // ---------------------------------------------------------------------------
  async exportPatients(filters: ExportFilterDto, user: any) {
    const where: Prisma.PatientWhereInput = {};

    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }

      const activeGrants = await this.prisma.accessGrant.findMany({
        where: { doctorId: doctor.id, isActive: true },
        select: { patientId: true },
      });
      where.id = { in: activeGrants.map((g) => g.patientId) };
    } else if (user.role === 'institution_admin') {
      const institution = await this.prisma.institution.findFirst({
        where: { adminUserId: user.id },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvee');
      }

      const doctors = await this.prisma.doctor.findMany({
        where: { institutionId: institution.id },
        select: { id: true },
      });
      const doctorIds = doctors.map((d) => d.id);

      const consultations = await this.prisma.consultation.findMany({
        where: { doctorId: { in: doctorIds } },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      where.id = { in: consultations.map((c) => c.patientId) };
    }

    const patients = await this.prisma.patient.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (filters.format === 'csv') {
      const rows = patients.map((p) => ({
        carypassId: p.carypassId,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        email: p.user.email,
        phone: p.user.phone || '',
        dateOfBirth: p.dateOfBirth?.toISOString().split('T')[0] || '',
        gender: p.gender || '',
        bloodGroup: p.bloodGroup || '',
        createdAt: p.createdAt.toISOString(),
      }));
      const csv = await this.generateCsv(rows);
      return { csv, filename: 'patients.csv' };
    }

    return {
      success: true,
      data: patients,
      meta: { total: patients.length, format: filters.format || 'json' },
    };
  }

  // ---------------------------------------------------------------------------
  // EXPORT CONSULTATIONS
  // ---------------------------------------------------------------------------
  async exportConsultations(filters: ExportFilterDto, user: any) {
    const where: Prisma.ConsultationWhereInput = {};

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        (where.date as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        (where.date as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
      }
    }

    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }
      where.doctorId = doctor.id;
    } else if (user.role === 'institution_admin') {
      const institution = await this.prisma.institution.findFirst({
        where: { adminUserId: user.id },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvee');
      }

      const doctors = await this.prisma.doctor.findMany({
        where: { institutionId: institution.id },
        select: { id: true },
      });
      where.doctorId = { in: doctors.map((d) => d.id) };
    }

    const consultations = await this.prisma.consultation.findMany({
      where,
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    if (filters.format === 'csv') {
      const rows = consultations.map((c) => ({
        id: c.id,
        date: c.date.toISOString().split('T')[0],
        type: c.type,
        motif: c.motif,
        diagnosis: c.diagnosis || '',
        notes: c.notes || '',
        status: c.status,
        severity: c.severity || '',
        patientName: `${c.patient.user.firstName} ${c.patient.user.lastName}`,
        doctorName: `${c.doctor.user.firstName} ${c.doctor.user.lastName}`,
      }));
      const csv = await this.generateCsv(rows);
      return { csv, filename: 'consultations.csv' };
    }

    return {
      success: true,
      data: consultations,
      meta: { total: consultations.length, format: filters.format || 'json' },
    };
  }

  // ---------------------------------------------------------------------------
  // EXPORT LAB RESULTS
  // ---------------------------------------------------------------------------
  async exportLabResults(filters: ExportFilterDto, user: any) {
    const where: Prisma.LabResultWhereInput = {};

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        (where.date as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        (where.date as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
      }
    }

    if (user.role === 'doctor') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Profil medecin non trouve');
      }

      const activeGrants = await this.prisma.accessGrant.findMany({
        where: { doctorId: doctor.id, isActive: true },
        select: { patientId: true },
      });
      where.patientId = { in: activeGrants.map((g) => g.patientId) };
    } else if (user.role === 'lab') {
      where.uploadedById = user.id;
    }

    const labResults = await this.prisma.labResult.findMany({
      where,
      include: {
        patient: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        items: true,
      },
      orderBy: { date: 'desc' },
    });

    if (filters.format === 'csv') {
      const rows = labResults.map((lr) => ({
        id: lr.id,
        title: lr.title,
        category: lr.category,
        date: lr.date.toISOString().split('T')[0],
        status: lr.status,
        patientName: `${lr.patient.user.firstName} ${lr.patient.user.lastName}`,
        notes: lr.notes || '',
        itemCount: lr.items.length.toString(),
      }));
      const csv = await this.generateCsv(rows);
      return { csv, filename: 'lab-results.csv' };
    }

    return {
      success: true,
      data: labResults,
      meta: { total: labResults.length, format: filters.format || 'json' },
    };
  }

  // ---------------------------------------------------------------------------
  // EXPORT STATISTICS
  // ---------------------------------------------------------------------------
  async exportStatistics(filters: ExportFilterDto) {
    const now = new Date();
    const months: { month: string; consultations: number; labResults: number; newPatients: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const monthLabel = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

      const [consultations, labResults, newPatients] = await Promise.all([
        this.prisma.consultation.count({
          where: { date: { gte: monthStart, lt: monthEnd } },
        }),
        this.prisma.labResult.count({
          where: { date: { gte: monthStart, lt: monthEnd } },
        }),
        this.prisma.patient.count({
          where: { createdAt: { gte: monthStart, lt: monthEnd } },
        }),
      ]);

      months.push({ month: monthLabel, consultations, labResults, newPatients });
    }

    if (filters.format === 'csv') {
      const csv = await this.generateCsv(months);
      return { csv, filename: 'statistics.csv' };
    }

    return {
      success: true,
      data: { monthlyStats: months },
      meta: { format: filters.format || 'json' },
    };
  }

  // ---------------------------------------------------------------------------
  // GENERATE CONSULTATION PDF
  // ---------------------------------------------------------------------------
  async generateConsultationPdf(consultationId: string): Promise<Buffer> {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        patient: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true, phone: true },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        prescriptions: {
          include: { items: true },
        },
      },
    });

    if (!consultation) {
      throw new NotFoundException('Consultation non trouvee');
    }

    // Fetch lab results for this patient around the consultation date
    const labResults = await this.prisma.labResult.findMany({
      where: {
        patientId: consultation.patientId,
        date: {
          gte: new Date(consultation.date.getTime() - 7 * 24 * 60 * 60 * 1000),
          lte: new Date(consultation.date.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      include: { items: true },
      orderBy: { date: 'desc' },
    });

    return this.createPdfBuffer((doc) => {
      // Header
      this.addPdfHeader(doc, 'Rapport de Consultation');

      // Patient info section
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Informations du Patient')
        .moveDown(0.3)
        .fontSize(10)
        .font('Helvetica')
        .text(`Nom : ${consultation.patient.user.firstName} ${consultation.patient.user.lastName}`)
        .text(`CaryPass ID : ${consultation.patient.carypassId}`)
        .text(`Email : ${consultation.patient.user.email || 'N/A'}`)
        .text(`Telephone : ${consultation.patient.user.phone || 'N/A'}`)
        .text(`Date de naissance : ${consultation.patient.dateOfBirth?.toLocaleDateString('fr-FR') || 'N/A'}`)
        .text(`Groupe sanguin : ${consultation.patient.bloodGroup || 'N/A'}`)
        .moveDown(1);

      // Consultation details
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Details de la Consultation')
        .moveDown(0.3)
        .fontSize(10)
        .font('Helvetica')
        .text(`Date : ${consultation.date.toLocaleDateString('fr-FR')}`)
        .text(`Type : ${consultation.type}`)
        .text(`Statut : ${consultation.status}`)
        .text(`Medecin : Dr. ${consultation.doctor.user.firstName} ${consultation.doctor.user.lastName}`)
        .text(`Motif : ${consultation.motif}`)
        .text(`Symptomes : ${consultation.symptoms || 'Non renseigne'}`)
        .text(`Diagnostic : ${consultation.diagnosis || 'En attente'}`)
        .text(`Severite : ${consultation.severity || 'Non evaluee'}`)
        .moveDown(0.5);

      if (consultation.notes) {
        doc
          .font('Helvetica-Bold')
          .text('Notes :')
          .font('Helvetica')
          .text(consultation.notes)
          .moveDown(0.5);
      }

      if (consultation.vitalSigns) {
        doc
          .font('Helvetica-Bold')
          .text('Signes vitaux :')
          .font('Helvetica')
          .text(JSON.stringify(consultation.vitalSigns, null, 2))
          .moveDown(0.5);
      }

      // Prescriptions
      if (consultation.prescriptions.length > 0) {
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica-Bold').text('Prescriptions').moveDown(0.3);

        for (const prescription of consultation.prescriptions) {
          doc.fontSize(10).font('Helvetica-Bold').text(`Prescription (${prescription.status})`).moveDown(0.2);

          if (prescription.notes) {
            doc.font('Helvetica').text(`Notes : ${prescription.notes}`).moveDown(0.2);
          }

          if (prescription.items.length > 0) {
            const headers = ['Medicament', 'Dosage', 'Frequence', 'Duree', 'Instructions'];
            const rows = prescription.items.map((item) => [
              item.medication,
              item.dosage || '',
              item.frequency || '',
              item.duration || '',
              item.instructions || '',
            ]);
            const colWidths = [120, 80, 80, 70, 145];
            this.addPdfTable(doc, headers, rows, colWidths);
          }
          doc.moveDown(0.5);
        }
      }

      // Lab results
      if (labResults.length > 0) {
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica-Bold').text('Resultats de Laboratoire').moveDown(0.3);

        for (const lr of labResults) {
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(`${lr.title} (${lr.date.toLocaleDateString('fr-FR')}) - ${lr.status}`)
            .moveDown(0.2);

          if (lr.items.length > 0) {
            const headers = ['Analyse', 'Valeur', 'Unite', 'Reference', 'Anormal'];
            const rows = lr.items.map((item) => [
              item.name,
              item.value,
              item.unit || '',
              item.referenceRange || '',
              item.isAbnormal ? 'OUI' : '',
            ]);
            const colWidths = [140, 80, 60, 100, 60];
            this.addPdfTable(doc, headers, rows, colWidths);
          }
          doc.moveDown(0.5);
        }
      }

      // Footer
      doc
        .moveDown(1)
        .fontSize(8)
        .font('Helvetica')
        .text('Ce document a ete genere automatiquement par CARYPASS.', { align: 'center' })
        .text('Il ne remplace pas un avis medical professionnel.', { align: 'center' });
    });
  }
}
