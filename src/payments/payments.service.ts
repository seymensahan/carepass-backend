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
            correspondent: 'MTN_MOMO_CMR', // MTN Mobile Money Cameroon
            payer: {
              type: 'MSISDN',
              address: { value: dto.phoneNumber },
            },
            statementDescription: `CAREPASS ${plan.name}`,
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
}
