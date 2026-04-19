import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ReferralService } from '../referral/referral.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly pawapayBaseUrl: string;
  private readonly pawapayApiKey: string | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly referralService: ReferralService,
  ) {
    this.pawapayBaseUrl = this.configService.get<string>(
      'PAWAPAY_API_URL',
      'https://api.pawapay.io',
    );
    this.pawapayApiKey = this.configService.get<string>('PAWAPAY_API_KEY');

    if (!this.pawapayApiKey) {
      this.logger.warn('PAWAPAY_API_KEY not set — payments will fail');
    } else {
      this.logger.log(`PawaPay configured: ${this.pawapayBaseUrl}`);
    }
  }

  // ---------------------------------------------------------------------------
  // HTTPS request helper (copied from mboabooking — forces IPv4)
  // ---------------------------------------------------------------------------
  private pawapayRequest(
    method: string,
    path: string,
    body?: any,
  ): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.pawapayBaseUrl);
      const postData = body ? JSON.stringify(body) : undefined;

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method,
        family: 4, // Force IPv4 — fixes Node.js IPv6 timeout issue
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.pawapayApiKey}`,
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        },
        timeout: 30000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 0, data });
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('PawaPay request timeout'));
      });

      if (postData) req.write(postData);
      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Phone / correspondent helpers
  // ---------------------------------------------------------------------------
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('237')) return digits;
    return `237${digits}`;
  }

  private detectCorrespondent(phone: string): string {
    const normalized = this.normalizePhone(phone);
    // Orange Cameroon: 237 69x
    if (normalized.length >= 5 && normalized[3] === '6' && normalized[4] === '9') {
      return 'ORANGE_CMR';
    }
    // MTN Cameroon: 237 65x/66x/67x/68x
    return 'MTN_MOMO_CMR';
  }

  // ---------------------------------------------------------------------------
  // INITIATE PAYMENT (authenticated user — e.g. existing user renewing)
  // ---------------------------------------------------------------------------
  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan non trouvé ou inactif');
    }

    const existingActive = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
    });
    if (existingActive) {
      throw new BadRequestException('Vous avez déjà un abonnement actif');
    }

    const isYearly = dto.period === 'yearly' && plan.priceYearly;
    const amount = isYearly ? plan.priceYearly! : plan.priceMonthly;
    const depositId = uuidv4();
    const period = isYearly ? 'yearly' : 'monthly';

    const payment = await this.prisma.payment.create({
      data: {
        userId, amount, currency: 'XAF', paymentMethod: 'pawapay',
        externalId: depositId, phoneNumber: dto.phoneNumber,
        planId: dto.planId, period, status: 'pending',
      },
    });

    if (!this.pawapayApiKey) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: 'PawaPay non configuré' } });
      throw new BadRequestException('Service de paiement non configuré.');
    }

    const result = await this.callPawapayDeposit(depositId, amount, dto.phoneNumber, plan.name);

    if (result.status === 'ACCEPTED') {
      return {
        success: true,
        data: {
          paymentId: payment.id, externalId: depositId,
          amount, currency: 'XAF', status: 'pending',
          message: 'Paiement initié. Confirmez sur votre téléphone.',
        },
      };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'failed', failureReason: result.error || 'Paiement rejeté' },
    });
    throw new BadRequestException(result.error || 'Le paiement a été rejeté. Veuillez réessayer.');
  }

  // ---------------------------------------------------------------------------
  // INITIATE REGISTRATION PAYMENT (PUBLIC — no account created)
  // Account is created only when PawaPay webhook confirms COMPLETED.
  // ---------------------------------------------------------------------------
  async initiateRegistrationPayment(body: any) {
    const { planId, phoneNumber, period = 'yearly', registrationData } = body;

    if (!planId || !registrationData) {
      throw new BadRequestException('planId et registrationData requis');
    }

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan non trouvé ou inactif');
    }

    if (registrationData.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: registrationData.email } });
      if (existing) {
        throw new BadRequestException('Un compte avec cet email existe déjà');
      }
    }

    if (!this.pawapayApiKey) {
      throw new BadRequestException('Service de paiement non configuré.');
    }

    const isYearly = period === 'yearly' && plan.priceYearly;
    const amount = isYearly ? plan.priceYearly! : plan.priceMonthly;
    const depositId = uuidv4();

    // Store pending registration
    await this.prisma.pendingRegistration.create({
      data: { depositId, planId, period, amount, registrationData, status: 'pending' },
    });

    // Call PawaPay /deposits (same as mboabooking)
    const result = await this.callPawapayDeposit(depositId, amount, phoneNumber, plan.name);

    if (result.status === 'ACCEPTED') {
      this.logger.log(`Registration deposit ACCEPTED: ${depositId}`);
      return {
        success: true,
        data: {
          depositId, amount, currency: 'XAF', status: 'pending',
          message: 'Paiement initié. Confirmez sur votre téléphone.',
        },
      };
    }

    // Deposit rejected
    await this.prisma.pendingRegistration.update({
      where: { depositId },
      data: { status: 'failed' },
    });
    throw new BadRequestException(result.error || 'Le paiement a été rejeté. Veuillez réessayer.');
  }

  // ---------------------------------------------------------------------------
  // CALL PAWAPAY /deposits (exact same approach as mboabooking)
  // ---------------------------------------------------------------------------
  private async callPawapayDeposit(
    depositId: string,
    amount: any,
    phoneNumber: string,
    planName: string,
  ): Promise<{ depositId: string; status: string; error?: string }> {
    const formattedPhone = this.normalizePhone(phoneNumber);
    const correspondent = this.detectCorrespondent(phoneNumber);

    const requestBody = {
      depositId,
      amount: String(amount),
      currency: 'XAF',
      correspondent,
      payer: {
        type: 'MSISDN',
        address: { value: formattedPhone },
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: `CARYPASS ${planName}`.substring(0, 22).padEnd(4, ' '),
      country: 'CMR',
    };

    this.logger.log(`PawaPay deposit ${depositId}: ${amount} XAF via ${correspondent} to ${formattedPhone}`);

    try {
      const response = await this.pawapayRequest('POST', '/deposits', requestBody);

      if (response.status >= 400) {
        this.logger.error(`PawaPay deposit failed: ${response.status} - ${JSON.stringify(response.data)}`);
        return { depositId, status: 'REJECTED', error: `PawaPay error: ${response.status}` };
      }

      const data = response.data;
      this.logger.log(`PawaPay deposit ${data.depositId || depositId} status: ${data.status}`);

      if (data.status === 'REJECTED') {
        const reason = data.failureReason?.failureMessage || data.rejectionReason?.rejectionMessage || 'Paiement refusé';
        this.logger.error(`PawaPay deposit rejected: ${reason}`);
        return { depositId: data.depositId || depositId, status: 'REJECTED', error: reason };
      }

      return { depositId: data.depositId || depositId, status: data.status || 'ACCEPTED' };
    } catch (err) {
      this.logger.error(`PawaPay deposit request failed: ${err}`);
      return { depositId, status: 'REJECTED', error: 'Erreur de connexion au service de paiement' };
    }
  }

  // ---------------------------------------------------------------------------
  // PAWAPAY WEBHOOK (callback when payment is confirmed)
  // ---------------------------------------------------------------------------
  async handleWebhook(body: any) {
    const { depositId, status } = body;

    if (!depositId) {
      throw new BadRequestException('depositId manquant');
    }

    // Check if this is a pending registration payment
    const pendingReg = await this.prisma.pendingRegistration.findUnique({
      where: { depositId },
    });

    if (pendingReg) {
      return this.handleRegistrationWebhook(pendingReg, status, body);
    }

    // Otherwise, handle as a regular authenticated payment
    const payment = await this.prisma.payment.findUnique({
      where: { externalId: depositId },
    });

    if (!payment) {
      this.logger.warn(`Webhook for unknown payment: ${depositId}`);
      throw new NotFoundException('Paiement non trouvé');
    }

    if (status === 'COMPLETED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'completed', paidAt: new Date() },
      });
      await this.activateSubscription(payment.userId, payment.id);

      // Process referral for first-time patient payments
      await this.processReferralIfApplicable(payment.userId, payment.id, Number(payment.amount));

      this.logger.log(`Payment completed: ${depositId}`);
    } else if (status === 'FAILED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', failureReason: body.failureReason?.failureMessage },
      });
      this.logger.warn(`Payment failed: ${depositId}`);
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // HANDLE REGISTRATION WEBHOOK — create account after payment confirmed
  // ---------------------------------------------------------------------------
  private async handleRegistrationWebhook(pendingReg: any, status: string, body: any) {
    if (status === 'COMPLETED') {
      try {
        const regData = pendingReg.registrationData as any;
        const bcrypt = await import('bcrypt');

        const result = await this.prisma.$transaction(async (tx) => {
          const passwordHash = await bcrypt.hash(regData.password, 12);
          const role = regData.role || (regData.institutionName ? 'institution_admin' : 'patient');

          const user = await tx.user.create({
            data: {
              email: regData.email, passwordHash,
              role, availableRoles: [role],
              firstName: regData.firstName, lastName: regData.lastName,
              phone: regData.phone,
            },
          });

          // Healthcare roles (doctor, nurse) also get a patient profile so they can manage their own file
          const isHealthcareRole = role === 'doctor' || role === 'nurse';
          if (role === 'patient' || isHealthcareRole) {
            // Generate CaryPass ID
            const setting = await tx.systemSetting.findUnique({ where: { key: 'carypass_id_counter' } });
            const counter = parseInt(setting?.value || '0') + 1;
            await tx.systemSetting.upsert({
              where: { key: 'carypass_id_counter' },
              update: { value: counter.toString() },
              create: { key: 'carypass_id_counter', value: counter.toString(), description: 'Compteur CaryPass ID' },
            });
            const carypassId = `CP-${new Date().getFullYear()}-${counter.toString().padStart(5, '0')}`;

            await tx.patient.create({
              data: {
                userId: user.id,
                carypassId,
                dateOfBirth: regData.dateOfBirth ? new Date(regData.dateOfBirth) : new Date('2000-01-01'),
                gender: regData.gender || undefined,
                bloodGroup: regData.bloodGroup || undefined,
                referredByCode: regData.referralCode || undefined,
              },
            });

            if (isHealthcareRole) {
              await tx.user.update({
                where: { id: user.id },
                data: { availableRoles: [role, 'patient'] },
              });
            }
          }

          // Create Doctor profile for role=doctor
          if (role === 'doctor') {
            await tx.doctor.create({
              data: {
                userId: user.id,
                specialty: regData.doctorSpecialty || 'Médecine générale',
                licenseNumber: regData.doctorLicenseNumber || `MED-${Date.now()}`,
                city: regData.doctorCity,
              },
            });
          }

          // Create institution if role is institution_admin
          if (role === 'institution_admin' && regData.institutionName) {
            await tx.institution.create({
              data: {
                name: regData.institutionName, type: regData.institutionType || 'clinic',
                address: regData.institutionAddress, city: regData.institutionCity,
                phone: regData.institutionPhone, email: regData.institutionEmail,
                adminUserId: user.id, isVerified: false,
              },
            });
          }

          const startDate = new Date();
          const endDate = new Date(startDate);
          if (pendingReg.period === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
          else endDate.setMonth(endDate.getMonth() + 1);

          await tx.subscription.create({
            data: {
              userId: user.id, planId: pendingReg.planId,
              status: 'active', startDate, endDate, autoRenew: true,
            },
          });

          await tx.payment.create({
            data: {
              userId: user.id, amount: pendingReg.amount, currency: 'XAF',
              paymentMethod: 'pawapay', externalId: pendingReg.depositId,
              planId: pendingReg.planId, period: pendingReg.period,
              status: 'completed', paidAt: new Date(),
            },
          });

          return user;
        });

        await this.prisma.pendingRegistration.update({
          where: { id: pendingReg.id }, data: { status: 'completed' },
        });

        // Process referral if patient registered with a referral code
        const regRole = regData.role || (regData.institutionName ? 'institution_admin' : 'patient');
        if (regRole === 'patient' && regData.referralCode) {
          try {
            // Check if this is the patient's first payment (it is, since they just registered)
            const payment = await this.prisma.payment.findFirst({
              where: { userId: result.id, status: 'completed' },
            });
            if (payment) {
              await this.referralService.processReferral(
                result.id,
                regData.referralCode,
                payment.id,
                Number(pendingReg.amount),
              );
            }
          } catch (refErr) {
            this.logger.error(`Referral processing failed: ${refErr}`);
            // Don't fail the registration if referral processing fails
          }
        }

        this.logger.log(`Registration completed via payment: ${result.email} (${pendingReg.depositId})`);
      } catch (error) {
        this.logger.error(`Registration webhook failed: ${error}`);
        await this.prisma.pendingRegistration.update({
          where: { id: pendingReg.id }, data: { status: 'failed' },
        });
      }
    } else if (status === 'FAILED') {
      await this.prisma.pendingRegistration.update({
        where: { id: pendingReg.id }, data: { status: 'failed' },
      });
      this.logger.warn(`Registration payment failed: ${pendingReg.depositId}`);
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // ACTIVATE SUBSCRIPTION (for authenticated user payments)
  // ---------------------------------------------------------------------------
  private async activateSubscription(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.subscriptionId) return;

    const planId = payment.planId;
    if (!planId) {
      this.logger.warn(`Payment ${paymentId} has no planId`);
      return;
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    if (payment.period === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    const subscription = await this.prisma.subscription.create({
      data: { userId, planId, status: 'active', startDate, endDate, autoRenew: true },
    });

    await this.prisma.payment.update({
      where: { id: paymentId }, data: { subscriptionId: subscription.id },
    });
  }

  // ---------------------------------------------------------------------------
  // CHECK DEPOSIT STATUS (poll PawaPay)
  // ---------------------------------------------------------------------------
  async checkPawapayDepositStatus(depositId: string): Promise<any> {
    try {
      const response = await this.pawapayRequest('GET', `/deposits/${depositId}`);
      if (response.status >= 400) return null;
      const data = response.data;
      return Array.isArray(data) && data.length > 0 ? data[0] : data;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // GET PAYMENT HISTORY
  // ---------------------------------------------------------------------------
  async getPaymentHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId }, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { subscription: { include: { plan: true } } },
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);
    return { success: true, data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ---------------------------------------------------------------------------
  // GET PAYMENT STATUS
  // ---------------------------------------------------------------------------
  async getPaymentStatus(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId }, include: { subscription: { include: { plan: true } } },
    });
    if (!payment) throw new NotFoundException('Paiement non trouvé');
    return { success: true, data: payment };
  }

  // ---------------------------------------------------------------------------
  // CHECK SUBSCRIPTION STATUS
  // ---------------------------------------------------------------------------
  async getSubscriptionStatus(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' },
    });
    if (!sub) return { success: true, data: { hasSubscription: false, status: 'none' } };
    const isActive = sub.status === 'active' && sub.endDate > new Date();
    return {
      success: true,
      data: {
        hasSubscription: true, status: isActive ? 'active' : 'expired',
        plan: sub.plan?.name, planSlug: sub.plan?.slug, endDate: sub.endDate,
        daysRemaining: isActive ? Math.ceil((sub.endDate.getTime() - Date.now()) / 86400000) : 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // POLL PAYMENT STATUS
  // ---------------------------------------------------------------------------
  async pollPaymentStatus(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, userId } });
    if (!payment) throw new NotFoundException('Paiement non trouvé');
    if (payment.status === 'completed' || payment.status === 'failed') {
      return { success: true, data: { status: payment.status, paidAt: payment.paidAt } };
    }

    if (this.pawapayApiKey && payment.externalId) {
      const deposit = await this.checkPawapayDepositStatus(payment.externalId);
      if (deposit?.status === 'COMPLETED') {
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'completed', paidAt: new Date() } });
        await this.activateSubscription(userId, payment.id);
        await this.processReferralIfApplicable(userId, payment.id, Number(payment.amount));
        return { success: true, data: { status: 'completed', paidAt: new Date() } };
      }
      if (deposit?.status === 'FAILED') {
        const reason = deposit.failureReason?.failureCode || 'Payment failed';
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: reason } });
        return { success: true, data: { status: 'failed', failureReason: reason } };
      }
    }
    return { success: true, data: { status: payment.status } };
  }

  // ---------------------------------------------------------------------------
  // PROCESS REFERRAL IF APPLICABLE
  // Called after payment completion to check if referral split should apply
  // ---------------------------------------------------------------------------
  private async processReferralIfApplicable(
    userId: string,
    paymentId: string,
    paymentAmount: number,
  ) {
    try {
      // Check if user is a patient with a referral code
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
      });
      if (!patient || !patient.referredByCode) return;

      // Check if this is the patient's FIRST completed payment
      const completedPayments = await this.prisma.payment.count({
        where: { userId, status: 'completed' },
      });

      // Only process referral on the first payment (count should be 1 since we just completed it)
      if (completedPayments > 1) {
        this.logger.log(
          `Skipping referral for user ${userId} — not first payment (${completedPayments} completed)`,
        );
        return;
      }

      await this.referralService.processReferral(
        userId,
        patient.referredByCode,
        paymentId,
        paymentAmount,
      );
    } catch (err) {
      this.logger.error(`Referral processing failed for payment ${paymentId}: ${err}`);
      // Don't fail the payment if referral processing fails
    }
  }

  // ---------------------------------------------------------------------------
  // SEED DEFAULT PLANS
  // ---------------------------------------------------------------------------
  async seedDefaultPlans() {
    const defaults = [
      { slug: 'patient', name: 'Patient CaryPass', priceMonthly: 84, priceYearly: 1000, description: 'Accès à la plateforme CaryPass' },
      { slug: 'doctor_premium', name: 'Médecin Premium', priceMonthly: 2000, priceYearly: 20000, description: 'Synchronisation multi-institution' },
      { slug: 'clinique', name: 'Cliniques & Petits Centres', priceMonthly: 4167, priceYearly: 50000, description: 'Gestion clinique complète' },
      { slug: 'hopital_moyen', name: 'Hôpitaux Moyens', priceMonthly: 8334, priceYearly: 100000, description: 'Gestion hospitalière avancée' },
      { slug: 'grand_hopital', name: 'Grands Hôpitaux', priceMonthly: 20834, priceYearly: 250000, description: 'Solution hôpital complète' },
      { slug: 'laboratoire', name: 'Laboratoires', priceMonthly: 6250, priceYearly: 75000, description: 'Gestion de laboratoire' },
    ];
    for (const p of defaults) {
      await this.prisma.plan.upsert({
        where: { slug: p.slug },
        create: { name: p.name, slug: p.slug, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, description: p.description },
        update: { name: p.name, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly },
      });
    }
  }
}
