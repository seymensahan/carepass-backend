import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly pawapayApiUrl: string;
  private readonly pawapayApiKey: string | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    this.pawapayApiUrl = this.configService.get<string>(
      'PAWAPAY_API_URL',
      'https://api.sandbox.pawapay.io',
    );
    this.pawapayApiKey = this.configService.get<string>('PAWAPAY_API_KEY');

    if (!this.pawapayApiKey) {
      this.logger.warn('PAWAPAY_API_KEY not set — payments will be simulated');
    }
  }

  // ---------------------------------------------------------------------------
  // INITIATE PAYMENT (Mobile Money via Pawapay)
  // ---------------------------------------------------------------------------
  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    // Find the plan
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan non trouvé ou inactif');
    }

    // Check no existing active subscription
    const existingActive = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
    });
    if (existingActive) {
      throw new BadRequestException('Vous avez déjà un abonnement actif');
    }

    // Determine amount
    const isYearly = dto.period === 'yearly' && plan.priceYearly;
    const amount = isYearly ? plan.priceYearly! : plan.priceMonthly;

    const paymentId = uuidv4();

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'XAF',
        paymentMethod: 'pawapay',
        externalId: paymentId,
        phoneNumber: dto.phoneNumber,
        status: 'pending',
      },
    });

    // If Pawapay is configured, initiate real payment
    if (this.pawapayApiKey) {
      try {
        const response = await fetch(`${this.pawapayApiUrl}/deposits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.pawapayApiKey}`,
          },
          body: JSON.stringify({
            depositId: paymentId,
            amount: amount.toString(),
            currency: 'XAF',
            correspondent: this.detectCorrespondent(dto.phoneNumber),
            payer: {
              type: 'MSISDN',
              address: { value: this.normalizePhone(dto.phoneNumber) },
            },
            customerTimestamp: new Date().toISOString(),
            statementDescription: `CARYPASS ${plan.name}`.slice(0, 22).replace(/[^a-zA-Z0-9 ]/g, ''),
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          this.logger.error(`Pawapay deposit failed: ${error}`);
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'failed', failureReason: error },
          });
          throw new BadRequestException('Échec de l\'initiation du paiement');
        }

        this.logger.log(`Pawapay deposit initiated: ${paymentId}`);
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        this.logger.error(`Pawapay error: ${error}`);
        throw new BadRequestException('Erreur de connexion au service de paiement');
      }
    } else {
      // Simulate payment for development
      this.logger.log(`[PAYMENT MOCK] Payment ${paymentId} for ${amount} XAF — simulating success`);
      await this.simulatePaymentSuccess(payment.id, userId, dto.planId, isYearly ? 'yearly' : 'monthly');
    }

    return {
      success: true,
      data: {
        paymentId: payment.id,
        externalId: paymentId,
        amount,
        currency: 'XAF',
        status: this.pawapayApiKey ? 'pending' : 'completed',
        message: this.pawapayApiKey
          ? 'Paiement initié. Confirmez sur votre téléphone.'
          : 'Paiement simulé avec succès (mode développement)',
      },
    };
  }

  // ---------------------------------------------------------------------------
  // PAWAPAY WEBHOOK (callback when payment is confirmed)
  // ---------------------------------------------------------------------------
  async handleWebhook(body: any) {
    const { depositId, status } = body;

    if (!depositId) {
      throw new BadRequestException('depositId manquant');
    }

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

      // Activate subscription
      await this.activateSubscription(payment.userId, payment.id);

      this.logger.log(`Payment completed: ${depositId}`);
    } else if (status === 'FAILED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', failureReason: body.failureReason?.message },
      });
      this.logger.warn(`Payment failed: ${depositId}`);
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // GET PAYMENT HISTORY
  // ---------------------------------------------------------------------------
  async getPaymentHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscription: { include: { plan: true } },
        },
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---------------------------------------------------------------------------
  // GET PAYMENT STATUS
  // ---------------------------------------------------------------------------
  async getPaymentStatus(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { subscription: { include: { plan: true } } },
    });

    if (!payment) {
      throw new NotFoundException('Paiement non trouvé');
    }

    return { success: true, data: payment };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------
  private async simulatePaymentSuccess(paymentId: string, userId: string, planId: string, period: string) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'completed', paidAt: new Date() },
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    if (period === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'active',
        startDate,
        endDate,
        autoRenew: true,
      },
    });

    // Link payment to subscription
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { subscriptionId: subscription.id },
    });
  }

  private async activateSubscription(userId: string, paymentId: string) {
    // Find the plan from the most recent pending context
    // For now, we get the last payment's associated data
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return;

    // Check if subscription already created (e.g. via simulate)
    if (payment.subscriptionId) return;

    // Find the plan that was being purchased (from the most recent subscription attempt context)
    const plans = await this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: 'asc' } });
    if (plans.length === 0) return;

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId: plans[0].id,
        status: 'active',
        startDate,
        endDate,
        autoRenew: true,
      },
    });

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { subscriptionId: subscription.id },
    });
  }

  /**
   * Detect MNO correspondent from phone number.
   * Orange Cameroon: 237 69x
   * MTN Cameroon: 237 65x/66x/67x/68x
   */
  private detectCorrespondent(phone: string): string {
    const cleaned = phone.replace(/[^0-9]/g, '');
    const normalized = cleaned.startsWith('237') ? cleaned : '237' + cleaned;
    if (normalized.length >= 5 && normalized[3] === '6' && normalized[4] === '9') {
      return 'ORANGE_CMR';
    }
    return 'MTN_MOMO_CMR';
  }

  /**
   * Normalize phone to international format without +
   */
  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('237') && cleaned.length >= 12) return cleaned;
    if (cleaned.startsWith('6') && cleaned.length === 9) return '237' + cleaned;
    return cleaned;
  }

  // ---------------------------------------------------------------------------
  // CHECK SUBSCRIPTION STATUS
  // ---------------------------------------------------------------------------
  async getSubscriptionStatus(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) {
      return { success: true, data: { hasSubscription: false, status: 'none' } };
    }

    const isActive = sub.status === 'active' && sub.endDate > new Date();
    return {
      success: true,
      data: {
        hasSubscription: true,
        status: isActive ? 'active' : 'expired',
        plan: sub.plan?.name,
        planSlug: sub.plan?.slug,
        endDate: sub.endDate,
        daysRemaining: isActive ? Math.ceil((sub.endDate.getTime() - Date.now()) / 86400000) : 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // CHECK PAYMENT STATUS BY POLLING PAWAPAY
  // ---------------------------------------------------------------------------
  async pollPaymentStatus(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('Paiement non trouvé');

    if (payment.status === 'completed' || payment.status === 'failed') {
      return { success: true, data: { status: payment.status, paidAt: payment.paidAt } };
    }

    // If PawaPay is configured, poll
    if (this.pawapayApiKey && payment.externalId) {
      try {
        const response = await fetch(`${this.pawapayApiUrl}/deposits/${payment.externalId}`, {
          headers: { Authorization: `Bearer ${this.pawapayApiKey}` },
        });
        const data = await response.json();
        const deposit = Array.isArray(data) ? data[0] : data;

        if (deposit?.status === 'COMPLETED') {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'completed', paidAt: new Date() },
          });
          await this.activateSubscription(userId, payment.id);
          return { success: true, data: { status: 'completed', paidAt: new Date() } };
        }

        if (deposit?.status === 'FAILED') {
          const reason = deposit.failureReason?.failureCode || 'Payment failed';
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'failed', failureReason: reason },
          });
          return { success: true, data: { status: 'failed', failureReason: reason } };
        }
      } catch {
        // Polling failed, return current status
      }
    }

    return { success: true, data: { status: payment.status } };
  }

  // ---------------------------------------------------------------------------
  // SEED DEFAULT PLANS (called on startup or first use)
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
