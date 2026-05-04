import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class InstitutionReferralService {
  private readonly logger = new Logger(InstitutionReferralService.name);
  private readonly REFERRAL_SPLIT = 0.5; // 50% to institution wallet, 50% to platform

  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Generate (or fetch) the institution's referral code. Code format:
   * INST-{SHORTNAME}-{YEAR}, e.g. "INST-HCYAOUNDE-2026".
   *
   * Only the institution admin can call this initially; once created any
   * member can fetch the code via getCodeForMember.
   */
  async generateCode(adminUserId: string) {
    const institution = await this.prisma.institution.findFirst({
      where: { adminUserId },
    });
    if (!institution) {
      throw new ForbiddenException(
        "Vous devez être admin d'une institution pour générer un code",
      );
    }

    const existing = await this.prisma.institutionReferralCode.findUnique({
      where: { institutionId: institution.id },
    });
    if (existing) {
      return { success: true, data: existing };
    }

    const year = new Date().getFullYear();
    const shortName = institution.name
      .toUpperCase()
      .replace(/HÔPITAL|HOPITAL|CLINIQUE|CENTRE|LABORATOIRE|DE|DU|LA|LE/g, '')
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 12);

    let code = `INST-${shortName}-${year}`;
    let attempt = 0;
    while (true) {
      const candidateCode = attempt === 0 ? code : `${code}-${attempt}`;
      const duplicate = await this.prisma.institutionReferralCode.findUnique({
        where: { code: candidateCode },
      });
      if (!duplicate) {
        code = candidateCode;
        break;
      }
      attempt++;
    }

    const referralCode = await this.prisma.institutionReferralCode.create({
      data: {
        institutionId: institution.id,
        code,
        totalReferrals: 0,
        totalEarnings: 0,
        isActive: true,
      },
    });

    this.logger.log(
      `Institution referral code generated: ${code} for ${institution.name}`,
    );

    return { success: true, data: referralCode };
  }

  /**
   * Get the institution's referral code. Accessible by:
   *   - the institution admin (adminUserId match)
   *   - any active doctor affiliated to the institution (DoctorInstitution)
   *   - any nurse affiliated to the institution (Nurse.institutionId)
   *
   * If no code exists yet, returns null (so the UI can show a "generate"
   * button to the admin and a "code not yet available" message to other
   * members).
   */
  async getCodeForMember(userId: string) {
    const institutionId = await this.findInstitutionForUser(userId);
    if (!institutionId) {
      throw new ForbiddenException(
        "Vous n'êtes affilié à aucune institution",
      );
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, type: true, logoUrl: true },
    });
    const code = await this.prisma.institutionReferralCode.findUnique({
      where: { institutionId },
    });

    return {
      success: true,
      data: {
        institution,
        code: code || null,
      },
    };
  }

  /**
   * List the patients referred via this institution's code, with pagination.
   * Accessible by the admin; useful for the wallet/earnings dashboard.
   */
  async getInstitutionReferrals(
    adminUserId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const institution = await this.prisma.institution.findFirst({
      where: { adminUserId },
    });
    if (!institution) {
      throw new ForbiddenException("Vous n'êtes pas admin d'une institution");
    }
    const code = await this.prisma.institutionReferralCode.findUnique({
      where: { institutionId: institution.id },
    });
    if (!code) {
      return { success: true, data: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.institutionReferral.findMany({
        where: { institutionReferralCodeId: code.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patientUser: {
            select: { firstName: true, lastName: true, email: true, phone: true },
          },
        },
      }),
      this.prisma.institutionReferral.count({
        where: { institutionReferralCodeId: code.id },
      }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Public endpoint: validate a code during patient registration so the UI
   * can display the institution name before the patient pays.
   */
  async validateCode(code: string) {
    const referralCode = await this.prisma.institutionReferralCode.findUnique({
      where: { code },
      include: {
        institution: {
          select: { name: true, type: true, city: true, region: true, logoUrl: true },
        },
      },
    });
    if (!referralCode || !referralCode.isActive) {
      throw new NotFoundException('Code de parrainage institution invalide');
    }
    return {
      success: true,
      data: {
        code: referralCode.code,
        institution: referralCode.institution,
      },
    };
  }

  /**
   * Process a patient referral after a successful payment. Splits the amount
   * 50/50 between the institution wallet and the platform, and records an
   * audit-trail row in InstitutionReferral.
   *
   * Called from the payment webhook in the same place as the doctor referral.
   */
  async processReferral(
    patientUserId: string,
    code: string,
    paymentId: string,
    paymentAmount: number,
  ) {
    const codeRecord = await this.prisma.institutionReferralCode.findUnique({
      where: { code },
      include: { institution: true },
    });
    if (!codeRecord || !codeRecord.isActive) {
      this.logger.warn(`Invalid or inactive institution referral code: ${code}`);
      return null;
    }

    const existing = await this.prisma.institutionReferral.findUnique({
      where: {
        institutionReferralCodeId_patientUserId: {
          institutionReferralCodeId: codeRecord.id,
          patientUserId,
        },
      },
    });
    if (existing) {
      this.logger.log(
        `Patient ${patientUserId} already referred by institution code ${code} — skipping`,
      );
      return null;
    }

    const institutionEarning = Math.floor(paymentAmount * this.REFERRAL_SPLIT);
    const platformEarning = paymentAmount - institutionEarning;

    const referral = await this.prisma.institutionReferral.create({
      data: {
        institutionReferralCodeId: codeRecord.id,
        patientUserId,
        paymentId,
        institutionEarning,
        platformEarning,
        isInitialPayment: true,
      },
    });

    // Credit the institution admin's wallet (the wallet system is per-user;
    // the admin user receives the funds on behalf of the institution).
    if (codeRecord.institution.adminUserId) {
      await this.walletService.creditReferralEarning(
        codeRecord.institution.adminUserId,
        institutionEarning,
        paymentId,
        `Parrainage patient via institution — Code ${code}`,
      );
    } else {
      this.logger.warn(
        `Institution ${codeRecord.institutionId} has no adminUserId; cannot credit wallet`,
      );
    }

    await this.prisma.institutionReferralCode.update({
      where: { id: codeRecord.id },
      data: {
        totalReferrals: { increment: 1 },
        totalEarnings: { increment: institutionEarning },
      },
    });

    this.logger.log(
      `Institution referral processed: patient ${patientUserId}, code ${code}, ` +
      `institution gets ${institutionEarning} FCFA, platform gets ${platformEarning} FCFA`,
    );

    return {
      referralId: referral.id,
      institutionEarning,
      platformEarning,
    };
  }

  /**
   * Resolve the institution a user is affiliated with.
   * Order of resolution:
   *   1. User is the admin of an institution → that institution.
   *   2. User has an active Doctor profile with primary institutionId → that.
   *   3. User has an active DoctorInstitution row → the linked institution.
   *   4. User has a Nurse profile with institutionId → that institution.
   * Returns null if none.
   */
  private async findInstitutionForUser(userId: string): Promise<string | null> {
    const adminInst = await this.prisma.institution.findFirst({
      where: { adminUserId: userId },
      select: { id: true },
    });
    if (adminInst) return adminInst.id;

    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      include: {
        institutions: {
          where: { isActive: true },
          orderBy: { isPrimary: 'desc' },
          take: 1,
        },
      },
    });
    if (doctor?.institutionId) return doctor.institutionId;
    if (doctor?.institutions?.[0]?.institutionId) return doctor.institutions[0].institutionId;

    const nurse = await this.prisma.nurse.findUnique({
      where: { userId },
      select: { institutionId: true },
    });
    if (nurse?.institutionId) return nurse.institutionId;

    return null;
  }
}
