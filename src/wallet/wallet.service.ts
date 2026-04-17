import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly pawapayBaseUrl: string;
  private readonly pawapayApiKey: string | undefined;
  private readonly MINIMUM_BALANCE = 10000; // 10,000 FCFA reserved for annual subscription

  constructor(
    private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    this.pawapayBaseUrl = this.configService.get<string>(
      'PAWAPAY_API_URL',
      'https://api.pawapay.io',
    );
    this.pawapayApiKey = this.configService.get<string>('PAWAPAY_API_KEY');
  }

  // ---------------------------------------------------------------------------
  // HTTPS request helper (same pattern as PaymentsService)
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
        family: 4,
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
  // Phone helpers (same as PaymentsService)
  // ---------------------------------------------------------------------------
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('237')) return digits;
    return `237${digits}`;
  }

  private detectCorrespondent(phone: string): string {
    const normalized = this.normalizePhone(phone);
    if (normalized.length >= 5 && normalized[3] === '6' && normalized[4] === '9') {
      return 'ORANGE_CMR';
    }
    return 'MTN_MOMO_CMR';
  }

  // ---------------------------------------------------------------------------
  // GET OR CREATE WALLET
  // ---------------------------------------------------------------------------
  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId, balance: 0 },
      });
      this.logger.log(`Wallet created for user ${userId}`);
    }

    return wallet;
  }

  // ---------------------------------------------------------------------------
  // GET BALANCE
  // ---------------------------------------------------------------------------
  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      success: true,
      data: {
        walletId: wallet.id,
        balance: wallet.balance,
        availableForWithdrawal: Math.max(
          0,
          Number(wallet.balance) - this.MINIMUM_BALANCE,
        ),
        minimumBalance: this.MINIMUM_BALANCE,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET TRANSACTIONS (paginated)
  // ---------------------------------------------------------------------------
  async getTransactions(userId: string, page: number = 1, limit: number = 20) {
    const wallet = await this.getOrCreateWallet(userId);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({
        where: { walletId: wallet.id },
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
  // CREDIT REFERRAL EARNING
  // ---------------------------------------------------------------------------
  async creditReferralEarning(
    userId: string,
    amount: number,
    paymentId: string,
    description?: string,
  ) {
    const wallet = await this.getOrCreateWallet(userId);
    const balanceBefore = new Decimal(wallet.balance);
    const creditAmount = new Decimal(amount);
    const balanceAfter = balanceBefore.add(creditAmount);

    const [updatedWallet, transaction] = await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'referral_earning',
          amount: creditAmount,
          description: description || `Gain de parrainage patient`,
          referenceId: paymentId,
          balanceBefore,
          balanceAfter,
        },
      }),
    ]);

    this.logger.log(
      `Referral earning credited: ${amount} FCFA to wallet ${wallet.id} (user ${userId})`,
    );

    return { wallet: updatedWallet, transaction };
  }

  // ---------------------------------------------------------------------------
  // DEBIT SUBSCRIPTION
  // ---------------------------------------------------------------------------
  async debitSubscription(userId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(userId);
    const balanceBefore = new Decimal(wallet.balance);
    const debitAmount = new Decimal(amount);
    const balanceAfter = balanceBefore.sub(debitAmount);

    if (balanceAfter.lessThan(0)) {
      throw new BadRequestException(
        'Solde insuffisant pour le débit d\'abonnement',
      );
    }

    const [updatedWallet, transaction] = await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'subscription_debit',
          amount: debitAmount,
          description: `Abonnement annuel médecin - ${amount} FCFA`,
          balanceBefore,
          balanceAfter,
        },
      }),
    ]);

    this.logger.log(
      `Subscription debit: ${amount} FCFA from wallet ${wallet.id} (user ${userId})`,
    );

    return { wallet: updatedWallet, transaction };
  }

  // ---------------------------------------------------------------------------
  // REQUEST WITHDRAWAL
  // ---------------------------------------------------------------------------
  async requestWithdrawal(userId: string, amount: number, phoneNumber: string) {
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const wallet = await this.getOrCreateWallet(userId);
    const currentBalance = Number(wallet.balance);

    // Must keep minimum 10,000 FCFA for annual subscription
    if (currentBalance < amount + this.MINIMUM_BALANCE) {
      throw new BadRequestException(
        `Solde insuffisant. Vous devez conserver au minimum ${this.MINIMUM_BALANCE} FCFA pour votre abonnement annuel. ` +
        `Solde actuel: ${currentBalance} FCFA, retrait demandé: ${amount} FCFA, ` +
        `disponible pour retrait: ${Math.max(0, currentBalance - this.MINIMUM_BALANCE)} FCFA`,
      );
    }

    const payoutId = uuidv4();
    const balanceBefore = new Decimal(wallet.balance);
    const withdrawAmount = new Decimal(amount);
    const balanceAfter = balanceBefore.sub(withdrawAmount);

    // Call Pawapay payout API
    if (this.pawapayApiKey) {
      const formattedPhone = this.normalizePhone(phoneNumber);
      const correspondent = this.detectCorrespondent(phoneNumber);

      const requestBody = {
        payoutId,
        amount: String(amount),
        currency: 'XAF',
        correspondent,
        recipient: {
          type: 'MSISDN',
          address: { value: formattedPhone },
        },
        customerTimestamp: new Date().toISOString(),
        statementDescription: 'CARYPASS RETRAIT',
        country: 'CMR',
      };

      this.logger.log(
        `PawaPay payout ${payoutId}: ${amount} XAF via ${correspondent} to ${formattedPhone}`,
      );

      try {
        const response = await this.pawapayRequest('POST', '/payouts', requestBody);

        if (response.status >= 400) {
          this.logger.error(
            `PawaPay payout failed: ${response.status} - ${JSON.stringify(response.data)}`,
          );
          throw new BadRequestException(
            'Le retrait a échoué. Veuillez réessayer.',
          );
        }

        const data = response.data;
        if (data.status === 'REJECTED') {
          const reason =
            data.failureReason?.failureMessage ||
            data.rejectionReason?.rejectionMessage ||
            'Retrait refusé';
          throw new BadRequestException(reason);
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        this.logger.error(`PawaPay payout request failed: ${err}`);
        throw new BadRequestException(
          'Erreur de connexion au service de paiement',
        );
      }
    } else {
      this.logger.warn(
        `PawaPay not configured — simulating payout ${payoutId}`,
      );
    }

    // Debit wallet and record transaction
    const [updatedWallet, transaction] = await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'withdrawal',
          amount: withdrawAmount,
          description: `Retrait Mobile Money vers ${phoneNumber}`,
          referenceId: payoutId,
          balanceBefore,
          balanceAfter,
        },
      }),
    ]);

    this.logger.log(
      `Withdrawal completed: ${amount} FCFA from wallet ${wallet.id} (payout ${payoutId})`,
    );

    return {
      success: true,
      data: {
        payoutId,
        amount,
        phoneNumber,
        balanceBefore: Number(balanceBefore),
        balanceAfter: Number(balanceAfter),
        transaction,
      },
    };
  }
}
