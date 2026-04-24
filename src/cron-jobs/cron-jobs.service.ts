import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CronJobStatus, CronJobTrigger, PrismaClient } from '@prisma/client';

export type CronJobRunResult = {
  itemsProcessed?: number;
  itemsAffected?: number;
  details?: Record<string, any>;
};

/**
 * Static registry of cron jobs. Used to render the "jobs" list on the super
 * admin dashboard and to validate manual trigger requests.
 *
 * When you add a new @Cron() handler, add it here so it shows up in the UI.
 */
export const CRON_JOBS_REGISTRY = [
  {
    name: 'subscription-renewal',
    label: 'Renouvellement des abonnements',
    description:
      'Débite le portefeuille des médecins, étend les abonnements d\'1 an. Marque expirés les comptes patients/institutions dont l\'abonnement arrive à échéance.',
    schedule: '0 2 * * *', // EVERY_DAY_AT_2AM
    scheduleHuman: 'Chaque jour à 02:00',
    triggerEndpoint: 'POST /wallet/admin/trigger-renewal',
  },
  {
    name: 'access-grants-cleanup',
    label: 'Révocation des accès expirés',
    description:
      'Révoque automatiquement les accès médecin/infirmier au dossier des patients dont la durée accordée est dépassée. Notifie le patient et le soignant à chaque révocation.',
    schedule: '0 * * * *', // EVERY_HOUR
    scheduleHuman: 'Chaque heure',
    triggerEndpoint: 'POST /access-grants/admin/trigger-cleanup',
  },
] as const;

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Wrap a cron handler with automatic logging. Creates a CronJobExecution
   * row before running, updates it on success/failure with duration + metrics.
   * Use this for every scheduled job so they all show up in the audit.
   */
  async runWithLogging<T extends CronJobRunResult | void>(
    jobName: string,
    fn: () => Promise<T>,
    trigger: CronJobTrigger = CronJobTrigger.scheduled,
  ): Promise<T> {
    const execution = await this.prisma.cronJobExecution.create({
      data: {
        jobName,
        trigger,
        status: CronJobStatus.running,
      },
    });

    const startTime = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      const summary = (result ?? {}) as CronJobRunResult;

      // Decide status: failed count > 0 → partial_failure, else success
      const status =
        (summary.details?.failed ?? 0) > 0
          ? CronJobStatus.partial_failure
          : CronJobStatus.success;

      await this.prisma.cronJobExecution.update({
        where: { id: execution.id },
        data: {
          finishedAt: new Date(),
          durationMs,
          status,
          itemsProcessed: summary.itemsProcessed ?? 0,
          itemsAffected: summary.itemsAffected ?? 0,
          details: summary.details ?? {},
        },
      });

      this.logger.log(
        `Cron "${jobName}" completed in ${durationMs}ms — ${summary.itemsProcessed ?? 0} processed, ${summary.itemsAffected ?? 0} affected`,
      );

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.prisma.cronJobExecution.update({
        where: { id: execution.id },
        data: {
          finishedAt: new Date(),
          durationMs,
          status: CronJobStatus.failed,
          errorMessage,
        },
      });

      this.logger.error(`Cron "${jobName}" failed after ${durationMs}ms: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * List all registered cron jobs with their last execution summary.
   */
  async listJobs() {
    const jobs = await Promise.all(
      CRON_JOBS_REGISTRY.map(async (job) => {
        const lastExecution = await this.prisma.cronJobExecution.findFirst({
          where: { jobName: job.name },
          orderBy: { startedAt: 'desc' },
        });
        const totalRuns = await this.prisma.cronJobExecution.count({
          where: { jobName: job.name },
        });
        const failedRuns = await this.prisma.cronJobExecution.count({
          where: { jobName: job.name, status: CronJobStatus.failed },
        });

        return {
          ...job,
          lastExecution,
          totalRuns,
          failedRuns,
        };
      }),
    );
    return jobs;
  }

  /**
   * Paginated history of a specific cron job.
   */
  async getHistory(jobName: string, page = 1, limit = 20) {
    // Validate job name is known
    const knownJob = CRON_JOBS_REGISTRY.find((j) => j.name === jobName);
    if (!knownJob) throw new NotFoundException(`Cron job "${jobName}" non trouvé`);

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.cronJobExecution.findMany({
        where: { jobName },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.cronJobExecution.count({ where: { jobName } }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      job: knownJob,
    };
  }
}
