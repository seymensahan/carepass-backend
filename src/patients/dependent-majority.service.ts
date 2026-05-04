import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronJobTrigger, PrismaClient } from '@prisma/client';
import { CronJobsService } from '../cron-jobs/cron-jobs.service';

/**
 * Daily cron that notifies guardians when their dependent crosses the
 * majority-age threshold (default 16, configurable via the
 * `dependent_transfer_min_age` system setting). The guardian receives a
 * one-shot in-app notification telling them they can now hand the account
 * over to the dependent.
 *
 * Idempotent: a notification is only created once per (guardian, dependent)
 * pair — we look for an existing notification with link
 * `/dependents/{id}/transfer` before creating a new one.
 */
@Injectable()
export class DependentMajorityService {
  private readonly logger = new Logger(DependentMajorityService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cronJobsService: CronJobsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyCheck() {
    await this.cronJobsService.runWithLogging(
      'dependent-majority-check',
      CronJobTrigger.scheduled,
      () => this.notifyGuardiansOfMajority(),
    );
  }

  async manualTrigger() {
    return this.cronJobsService.runWithLogging(
      'dependent-majority-check',
      CronJobTrigger.manual,
      () => this.notifyGuardiansOfMajority(),
    );
  }

  private async notifyGuardiansOfMajority() {
    const ageSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'dependent_transfer_min_age' },
    });
    const minAge = parseInt(ageSetting?.value || '16');

    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - minAge);

    // Find all active guardianships where the dependent was born before
    // the cutoff (i.e. is now at or above minAge), can still be managed,
    // and the dependent account is still on the synthetic email pattern.
    const eligible = await this.prisma.legalGuardian.findMany({
      where: {
        canManage: true,
        transferredAt: null,
        dependent: {
          dateOfBirth: { lte: cutoffDate },
          managedByGuardian: true,
          isMinor: true,
        },
      },
      include: {
        dependent: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        guardian: { include: { user: { select: { id: true, firstName: true } } } },
      },
    });

    let created = 0;
    for (const g of eligible) {
      const guardianUserId = g.guardian.user.id;
      const transferLink = `/dependents/${g.dependentId}/transfer`;

      const already = await this.prisma.notification.findFirst({
        where: { userId: guardianUserId, link: transferLink },
      });
      if (already) continue;

      const dependentName = `${g.dependent.user.firstName} ${g.dependent.user.lastName}`;
      const ageYears = Math.floor(
        (Date.now() - new Date(g.dependent.dateOfBirth).getTime()) /
          (365.25 * 24 * 3600 * 1000),
      );

      await this.prisma.notification.create({
        data: {
          userId: guardianUserId,
          title: `${dependentName} a ${ageYears} ans`,
          message: `Vous pouvez désormais transférer la gestion du dossier médical à ${dependentName}. Il/elle pourra se connecter avec son propre email et mot de passe, tout en gardant l'historique médical complet.`,
          type: 'info',
          link: transferLink,
        },
      });
      created++;
    }

    return {
      itemsProcessed: eligible.length,
      itemsAffected: created,
      details: { minAge, cutoffDate: cutoffDate.toISOString() },
    };
  }
}
