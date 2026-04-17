import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  private readonly REFERRAL_SPLIT = 0.5; // 50% to doctor, 50% to CarePass

  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService,
  ) {}

  // ---------------------------------------------------------------------------
  // GENERATE CODE — creates "DR-LASTNAME-YEAR" style code
  // ---------------------------------------------------------------------------
  async generateCode(userId: string) {
    // Check if code already exists
    const existing = await this.prisma.referralCode.findUnique({
      where: { doctorUserId: userId },
    });
    if (existing) {
      return { success: true, data: existing };
    }

    // Verify user is a doctor
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { doctor: true },
    });
    if (!user || user.role !== 'doctor') {
      throw new BadRequestException('Seuls les médecins peuvent générer un code de parrainage');
    }

    // Generate code: DR-LASTNAME-YEAR
    const year = new Date().getFullYear();
    const lastName = user.lastName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .substring(0, 10);
    let code = `DR-${lastName}-${year}`;

    // Ensure uniqueness — append a number if needed
    let attempt = 0;
    while (true) {
      const candidateCode = attempt === 0 ? code : `${code}-${attempt}`;
      const duplicate = await this.prisma.referralCode.findUnique({
        where: { code: candidateCode },
      });
      if (!duplicate) {
        code = candidateCode;
        break;
      }
      attempt++;
    }

    const referralCode = await this.prisma.referralCode.create({
      data: {
        doctorUserId: userId,
        code,
        totalReferrals: 0,
        totalEarnings: 0,
        isActive: true,
      },
    });

    this.logger.log(`Referral code generated: ${code} for user ${userId}`);
    return { success: true, data: referralCode };
  }

  // ---------------------------------------------------------------------------
  // GET MY CODE — returns the doctor's referral code with stats
  // ---------------------------------------------------------------------------
  async getMyCode(userId: string) {
    const referralCode = await this.prisma.referralCode.findUnique({
      where: { doctorUserId: userId },
    });

    if (!referralCode) {
      return { success: true, data: null, message: 'Aucun code de parrainage. Utilisez POST /referral/generate pour en créer un.' };
    }

    return { success: true, data: referralCode };
  }

  // ---------------------------------------------------------------------------
  // GET MY REFERRALS — list patients referred by this doctor
  // ---------------------------------------------------------------------------
  async getMyReferrals(userId: string, page: number = 1, limit: number = 20) {
    const referralCode = await this.prisma.referralCode.findUnique({
      where: { doctorUserId: userId },
    });

    if (!referralCode) {
      return {
        success: true,
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.referral.findMany({
        where: { referralCodeId: referralCode.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patientUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.referral.count({
        where: { referralCodeId: referralCode.id },
      }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // VALIDATE CODE — checks if a referral code is valid (public)
  // ---------------------------------------------------------------------------
  async validateCode(code: string) {
    const referralCode = await this.prisma.referralCode.findUnique({
      where: { code },
      include: {
        doctorUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            doctor: {
              select: {
                specialty: true,
                city: true,
              },
            },
          },
        },
      },
    });

    if (!referralCode || !referralCode.isActive) {
      return { success: false, message: 'Code de parrainage invalide ou inactif' };
    }

    return {
      success: true,
      data: {
        code: referralCode.code,
        doctor: {
          firstName: referralCode.doctorUser.firstName,
          lastName: referralCode.doctorUser.lastName,
          specialty: referralCode.doctorUser.doctor?.specialty,
          city: referralCode.doctorUser.doctor?.city,
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // PROCESS REFERRAL — called when a patient pays with a referral code
  // ---------------------------------------------------------------------------
  async processReferral(
    patientUserId: string,
    referralCode: string,
    paymentId: string,
    paymentAmount: number,
  ) {
    // 1. Find the ReferralCode
    const codeRecord = await this.prisma.referralCode.findUnique({
      where: { code: referralCode },
    });

    if (!codeRecord || !codeRecord.isActive) {
      this.logger.warn(`Invalid or inactive referral code: ${referralCode}`);
      return null;
    }

    // 2. Check if this patient was already referred (prevent double credit)
    const existingReferral = await this.prisma.referral.findUnique({
      where: {
        referralCodeId_patientUserId: {
          referralCodeId: codeRecord.id,
          patientUserId,
        },
      },
    });

    if (existingReferral) {
      this.logger.log(
        `Patient ${patientUserId} already referred by code ${referralCode} — skipping`,
      );
      return null;
    }

    // 3. Calculate split: 50% doctor, 50% CarePass
    const doctorEarning = Math.floor(paymentAmount * this.REFERRAL_SPLIT);
    const platformEarning = paymentAmount - doctorEarning;

    // 4. Create Referral record
    const referral = await this.prisma.referral.create({
      data: {
        referralCodeId: codeRecord.id,
        patientUserId,
        paymentId,
        doctorEarning,
        platformEarning,
        isInitialPayment: true,
      },
    });

    // 5. Credit 50% to doctor wallet
    await this.walletService.creditReferralEarning(
      codeRecord.doctorUserId,
      doctorEarning,
      paymentId,
      `Parrainage patient - Code ${referralCode}`,
    );

    // 6. Update referralCode stats
    await this.prisma.referralCode.update({
      where: { id: codeRecord.id },
      data: {
        totalReferrals: { increment: 1 },
        totalEarnings: {
          increment: doctorEarning,
        },
      },
    });

    this.logger.log(
      `Referral processed: patient ${patientUserId}, code ${referralCode}, ` +
      `doctor gets ${doctorEarning} FCFA, platform gets ${platformEarning} FCFA`,
    );

    return {
      referralId: referral.id,
      doctorEarning,
      platformEarning,
    };
  }
}
