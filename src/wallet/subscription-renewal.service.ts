import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronJobTrigger, PrismaClient } from '@prisma/client';
import { WalletService } from './wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CronJobsService } from '../cron-jobs/cron-jobs.service';

/**
 * Auto-renewal of doctor subscriptions from their wallet balance.
 *
 * Flow:
 *  - Runs daily at 02:00
 *  - Finds doctor subscriptions that expire today
 *  - Attempts to debit the renewal amount from the doctor's wallet
 *  - On success: extends the subscription by 1 year
 *  - On failure (insufficient balance): marks subscription as expired and notifies the doctor
 */
@Injectable()
export class SubscriptionRenewalService {
  private readonly logger = new Logger(SubscriptionRenewalService.name);

  private readonly JOB_NAME = 'subscription-renewal';

  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly cronJobsService: CronJobsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailyRenewal() {
    this.logger.log('Running daily subscription renewal check...');
    await this.cronJobsService.runWithLogging(
      this.JOB_NAME,
      () => this.processExpiringSubscriptions(),
      CronJobTrigger.scheduled,
    );
  }

  /**
   * Manual trigger (used by super admin "Run now" button).
   * Logs separately as a manual execution.
   */
  async triggerManually() {
    return this.cronJobsService.runWithLogging(
      this.JOB_NAME,
      () => this.processExpiringSubscriptions(),
      CronJobTrigger.manual,
    );
  }

  /**
   * Force the renewal of ONE specific user's subscription, regardless of
   * the expiry date. Used by super admin to test the wallet-debit flow
   * without waiting 6 months for natural expiry.
   *
   * Same effect as if the subscription expired today:
   *   - Doctor → wallet debited by current price, subscription extended 1 year.
   *     If wallet has insufficient funds → marked expired + notify.
   *   - Patient/institution → marked expired + notify (no wallet to debit).
   */
  async forceRenewSubscription(userId: string) {
    return this.cronJobsService.runWithLogging(
      this.JOB_NAME,
      async () => {
        const sub = await this.prisma.subscription.findFirst({
          where: { userId, status: 'active' },
          include: { user: true, plan: true },
          orderBy: { createdAt: 'desc' },
        });

        if (!sub) {
          return {
            itemsProcessed: 0,
            itemsAffected: 0,
            details: { error: 'Aucun abonnement actif trouvé pour cet utilisateur' },
          };
        }

        const role = sub.user.role;
        let renewed = 0;
        let failed = 0;
        let expired = 0;

        if (role === 'doctor') {
          const currentPrice = await this.walletService.getDoctorSubscriptionPrice();
          try {
            await this.walletService.debitSubscription(sub.userId, currentPrice);

            const newEndDate = new Date();
            newEndDate.setFullYear(newEndDate.getFullYear() + 1);

            await this.prisma.subscription.update({
              where: { id: sub.id },
              data: { endDate: newEndDate, status: 'active' },
            });

            await this.notificationsService
              .create(sub.userId, {
                title: 'Abonnement renouvelé (forcé)',
                message: `Renouvellement déclenché par l'administration. ${currentPrice} FCFA prélevés de votre portefeuille.`,
                type: 'success',
              })
              .catch(() => {});

            renewed = 1;
            this.logger.log(
              `Force-renewed doctor ${sub.user.email} for ${currentPrice} FCFA`,
            );
          } catch (error) {
            await this.prisma.subscription.update({
              where: { id: sub.id },
              data: { status: 'expired' },
            });
            await this.notificationsService
              .create(sub.userId, {
                title: 'Abonnement expiré',
                message: `Solde insuffisant (${currentPrice} FCFA requis). Rechargez votre portefeuille.`,
                type: 'error',
                link: '/doctor/wallet',
              })
              .catch(() => {});
            failed = 1;
            this.logger.warn(
              `Force-renewal failed for doctor ${sub.user.email}: ${(error as Error).message}`,
            );
          }
        } else {
          // Patient or institution_admin → expire + notify
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'expired' },
          });
          await this.notificationsService
            .create(sub.userId, {
              title: 'Abonnement expiré',
              message: 'Votre abonnement CAREPASS a été marqué comme expiré.',
              type: 'error',
            })
            .catch(() => {});
          expired = 1;
        }

        return {
          itemsProcessed: 1,
          itemsAffected: renewed + failed + expired,
          details: {
            userId,
            email: sub.user.email,
            role,
            renewed,
            failed,
            expired,
            forced: true,
          },
        };
      },
      CronJobTrigger.manual,
    );
  }

  /**
   * Process all subscriptions expiring today across all roles.
   *
   * - Doctors: attempt to auto-debit their wallet for the current annual price.
   *   On success, extend by 1 year. On insufficient balance, mark expired and
   *   notify them to recharge (the SubscriptionGate modal handles the rest).
   * - Patients & institution_admin: there is no wallet system for them, so we
   *   simply mark expired + notify. They will see the subscription gate on
   *   next login and pay manually via Mobile Money.
   *
   * Exposed publicly so super admin can trigger it manually for testing.
   */
  async processExpiringSubscriptions() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find ALL active subscriptions expiring in the next 24 hours, any role
    const expiringSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        endDate: { lte: tomorrow },
      },
      include: { user: true, plan: true },
    });

    this.logger.log(
      `Found ${expiringSubs.length} expiring subscriptions across all roles`,
    );

    let renewed = 0;
    let failed = 0;
    let expired = 0;

    for (const sub of expiringSubs) {
      const role = sub.user.role;

      // ───────────────────────────────────────────────────────────────────────
      // DOCTORS: try wallet auto-debit, extend on success
      // ───────────────────────────────────────────────────────────────────────
      if (role === 'doctor' && sub.autoRenew) {
        const currentPrice = await this.walletService.getDoctorSubscriptionPrice();

        try {
          await this.walletService.debitSubscription(sub.userId, currentPrice);

          const newEndDate = new Date(sub.endDate);
          newEndDate.setFullYear(newEndDate.getFullYear() + 1);

          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { endDate: newEndDate, status: 'active' },
          });

          this.logger.log(
            `Renewed doctor subscription ${sub.id} (${sub.user.email}) → ${newEndDate.toISOString()}`,
          );

          await this.notificationsService
            .create(sub.userId, {
              title: 'Abonnement renouvelé',
              message: `Votre abonnement a été renouvelé. ${currentPrice} FCFA prélevés de votre portefeuille.`,
              type: 'success',
            })
            .catch(() => {});

          renewed++;
        } catch (error) {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'expired' },
          });

          this.logger.warn(
            `Failed to renew doctor ${sub.user.email}: ${(error as Error).message}`,
          );

          await this.notificationsService
            .create(sub.userId, {
              title: 'Abonnement expiré',
              message: `Solde insuffisant (${currentPrice} FCFA requis). Rechargez votre portefeuille ou payez par Mobile Money.`,
              type: 'error',
              link: '/doctor/wallet',
            })
            .catch(() => {});

          failed++;
        }
        continue;
      }

      // ───────────────────────────────────────────────────────────────────────
      // PATIENTS, INSTITUTION_ADMIN, etc.: mark expired + notify, no wallet
      // ───────────────────────────────────────────────────────────────────────
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' },
      });

      this.logger.log(
        `Expired subscription ${sub.id} for ${role} ${sub.user.email} (no auto-renew for this role)`,
      );

      const linkByRole: Record<string, string> = {
        patient: '/subscription',
        institution_admin: '/admin/subscription',
      };

      await this.notificationsService
        .create(sub.userId, {
          title: 'Abonnement expiré',
          message:
            'Votre abonnement CAREPASS a expiré. Renouvelez par Mobile Money pour continuer à utiliser la plateforme.',
          type: 'error',
          link: linkByRole[role] ?? '/subscription',
        })
        .catch(() => {});

      expired++;
    }

    // Shape compatible with CronJobsService.runWithLogging() — also keeps
    // the legacy { processed, renewed, failed, expired } fields for any
    // existing callers that rely on them.
    return {
      processed: expiringSubs.length,
      renewed,
      failed,
      expired,
      // CronJobRunResult fields
      itemsProcessed: expiringSubs.length,
      itemsAffected: renewed + failed + expired,
      details: {
        renewed,
        failed,
        expired,
        affectedRoles: Array.from(new Set(expiringSubs.map((s) => s.user.role))),
      },
    };
  }
}
