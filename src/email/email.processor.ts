import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from './email.service';

export type EmailJobType =
  | 'password-reset'
  | 'email-verification'
  | 'welcome'
  | 'invitation'
  | 'appointment-reminder'
  | 'lab-result-ready'
  | 'access-request'
  | 'access-granted'
  | 'consultation-summary'
  | 'subscription-confirmation'
  | 'two-factor-code'
  | 'custom';

export interface EmailJobData {
  type: EmailJobType;
  to: string;
  data: Record<string, any>;
}

/**
 * BullMQ processor for the `emails` queue.
 *
 * Receives { type, to, data } payloads and dispatches to the matching
 * EmailService method. Only instantiated when the `emails` queue is
 * registered, i.e. when REDIS_HOST is set.
 */
@Processor('emails')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { type, to, data } = job.data;
    this.logger.log(`Processing email job ${job.id} [${type}] -> ${to}`);

    // Prevent the processor from re-enqueuing jobs (infinite loop): force
    // the service onto its synchronous send path for the duration of this
    // job.
    this.emailService.setBypassQueue(true);
    try {
      switch (type) {
        case 'password-reset':
          await this.emailService.sendPasswordResetEmail(to, data.firstName, data.resetToken);
          break;
        case 'email-verification':
          await this.emailService.sendEmailVerification(to, data.firstName, data.verificationToken);
          break;
        case 'welcome':
          await this.emailService.sendWelcomeEmail(to, data.firstName);
          break;
        case 'invitation':
          await this.emailService.sendInvitationEmail(
            to,
            data.firstName,
            data.institutionName,
            data.inviterName,
            data.role,
            data.inviteUrl,
          );
          break;
        case 'appointment-reminder':
          await this.emailService.sendAppointmentReminderEmail(
            to,
            data.firstName,
            data.doctorName,
            data.date,
            data.time,
            data.location,
          );
          break;
        case 'lab-result-ready':
          await this.emailService.sendLabResultReadyEmail(to, data.firstName, data.labTitle);
          break;
        case 'access-request':
          await this.emailService.sendAccessRequestEmail(
            to,
            data.firstName,
            data.doctorName,
            data.reason,
          );
          break;
        case 'access-granted':
          await this.emailService.sendAccessGrantedEmail(
            to,
            data.firstName,
            data.patientName,
            data.expiresAt,
          );
          break;
        case 'consultation-summary':
          await this.emailService.sendConsultationSummaryEmail(
            to,
            data.firstName,
            data.doctorName,
            data.date,
            data.diagnosis,
          );
          break;
        case 'subscription-confirmation':
          await this.emailService.sendSubscriptionConfirmationEmail(
            to,
            data.firstName,
            data.planName,
            data.endDate,
            data.amount,
          );
          break;
        case 'two-factor-code':
          await this.emailService.sendTwoFactorCodeEmail(to, data.firstName, data.code);
          break;
        case 'custom':
          await this.emailService.sendCustomEmail(to, data.subject, data.html);
          break;
        default:
          this.logger.warn(`Unknown email job type: ${type}`);
      }
    } catch (err: any) {
      this.logger.error(`Email job ${job.id} failed: ${err?.message || err}`);
      throw err;
    } finally {
      this.emailService.setBypassQueue(false);
    }
  }
}
