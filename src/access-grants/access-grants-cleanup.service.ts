import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronJobTrigger, PrismaClient } from '@prisma/client';
import { AccessGrantsService } from './access-grants.service';
import { CronJobsService } from '../cron-jobs/cron-jobs.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Scheduled cleanup of expired access grants.
 *
 * Doctors/nurses receive a time-limited grant when a patient (or guardian)
 * approves their access request. This cron revokes any grant whose
 * `expiresAt` is in the past, so doctors lose access to the patient's
 * record automatically once the period elapses.
 *
 * Runs every hour. The window is short because access duration is sensitive
 * (a 1h grant must actually expire in ~1h, not 24h).
 */
@Injectable()
export class AccessGrantsCleanupService {
  private readonly logger = new Logger(AccessGrantsCleanupService.name);
  private readonly JOB_NAME = 'access-grants-cleanup';

  constructor(
    private readonly prisma: PrismaClient,
    private readonly accessGrantsService: AccessGrantsService,
    private readonly cronJobsService: CronJobsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyCleanup() {
    this.logger.log('Running hourly access-grants cleanup...');
    await this.cronJobsService.runWithLogging(
      this.JOB_NAME,
      () => this.processExpiredGrants(),
      CronJobTrigger.scheduled,
    );
  }

  /**
   * Manual trigger (super admin "Run now" button).
   */
  async triggerManually() {
    return this.cronJobsService.runWithLogging(
      this.JOB_NAME,
      () => this.processExpiredGrants(),
      CronJobTrigger.manual,
    );
  }

  /**
   * Find expired grants, revoke them, and notify the affected doctors/patients.
   * Returns CronJobRunResult-compatible data so the cron history shows useful stats.
   */
  async processExpiredGrants() {
    const now = new Date();

    // Find expired grants BEFORE revoking, so we can notify
    const expiredGrants = await this.prisma.accessGrant.findMany({
      where: {
        isActive: true,
        expiresAt: { lt: now, not: null },
      },
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });

    if (expiredGrants.length === 0) {
      return {
        itemsProcessed: 0,
        itemsAffected: 0,
        details: { revoked: 0 },
      };
    }

    // Bulk revoke
    const grantIds = expiredGrants.map((g) => g.id);
    await this.prisma.accessGrant.updateMany({
      where: { id: { in: grantIds } },
      data: { isActive: false, revokedAt: now },
    });

    this.logger.log(`Revoked ${expiredGrants.length} expired access grant(s)`);

    // Notify everyone (non-blocking)
    for (const grant of expiredGrants) {
      const doctorName = `Dr. ${grant.doctor.user.firstName} ${grant.doctor.user.lastName}`;
      const patientName = `${grant.patient.user.firstName} ${grant.patient.user.lastName}`;

      // Notify patient
      this.notificationsService
        .create(grant.patient.user.id, {
          title: 'Accès expiré',
          message: `L'accès accordé à ${doctorName} à votre dossier a expiré.`,
          type: 'info',
        })
        .catch(() => {});

      // Notify doctor
      this.notificationsService
        .create(grant.doctor.user.id, {
          title: 'Accès expiré',
          message: `Votre accès au dossier de ${patientName} a expiré.`,
          type: 'warning',
        })
        .catch(() => {});
    }

    return {
      itemsProcessed: expiredGrants.length,
      itemsAffected: expiredGrants.length,
      details: {
        revoked: expiredGrants.length,
        affectedDoctorIds: Array.from(new Set(expiredGrants.map((g) => g.doctorId))),
      },
    };
  }
}
