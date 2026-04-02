import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email service initialized with API key: ' + apiKey.substring(0, 10) + '...');
    } else {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged to console only');
    }
    this.fromEmail = this.configService.get<string>('EMAIL_FROM', 'CARYPASS <onboarding@resend.dev>');
    this.logger.log(`Email FROM address: ${this.fromEmail}`);
  }

  async sendPasswordResetEmail(to: string, firstName: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Réinitialisation du mot de passe</h2>
        <p>Bonjour ${firstName},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour procéder :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #0066CC; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Réinitialiser mon mot de passe
          </a>
        </div>
        <p>Ce lien expirera dans <strong>1 heure</strong>.</p>
        <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Réinitialisation de votre mot de passe — CARYPASS', html);
  }

  async sendEmailVerification(to: string, firstName: string, verificationToken: string): Promise<void> {
    const verifyUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/verify-email?token=${verificationToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Vérification de votre email</h2>
        <p>Bonjour ${firstName},</p>
        <p>Bienvenue sur CARYPASS ! Veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #0066CC; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Vérifier mon email
          </a>
        </div>
        <p>Ce lien expirera dans <strong>24 heures</strong>.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Vérifiez votre email — CARYPASS', html);
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">Bienvenue sur CARYPASS !</h2>
        <p>Bonjour ${firstName},</p>
        <p>Votre compte CARYPASS a été créé avec succès. Vous pouvez maintenant :</p>
        <ul>
          <li>Gérer votre carnet de santé numérique</li>
          <li>Consulter vos résultats de laboratoire</li>
          <li>Prendre des rendez-vous médicaux</li>
          <li>Partager vos données de santé avec vos médecins</li>
        </ul>
        <p>N'oubliez pas de compléter votre profil pour profiter de toutes les fonctionnalités.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Bienvenue sur CARYPASS !', html);
  }

  async sendInvitationEmail(
    to: string,
    firstName: string,
    institutionName: string,
    inviterName: string,
    role: string,
    inviteUrl: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Invitation</h2>
        <p>Bonjour ${firstName},</p>
        <p><strong>${inviterName}</strong> vous invite à rejoindre <strong>${institutionName}</strong> en tant que <strong>${role}</strong> sur la plateforme CARYPASS.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #0066CC; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Accepter l'invitation
          </a>
        </div>
        <p>Ce lien expirera dans <strong>7 jours</strong>.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, `Invitation à rejoindre ${institutionName} — CARYPASS`, html);
  }

  async sendAppointmentReminderEmail(
    to: string,
    firstName: string,
    doctorName: string,
    date: string,
    time: string,
    location: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Rappel de rendez-vous</h2>
        <p>Bonjour ${firstName},</p>
        <p>Nous vous rappelons votre prochain rendez-vous médical :</p>
        <div style="background-color: #f8f9fa; border-left: 4px solid #0066CC; padding: 16px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Médecin :</strong> Dr. ${doctorName}</p>
          <p style="margin: 4px 0;"><strong>Date :</strong> ${date}</p>
          <p style="margin: 4px 0;"><strong>Heure :</strong> ${time}</p>
          <p style="margin: 4px 0;"><strong>Lieu :</strong> ${location}</p>
        </div>
        <p>Veuillez vous présenter 10 minutes avant l'heure prévue.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Rappel de rendez-vous — CARYPASS', html);
  }

  async sendLabResultReadyEmail(
    to: string,
    firstName: string,
    labTitle: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Résultat de laboratoire disponible</h2>
        <p>Bonjour ${firstName},</p>
        <p>Votre résultat de laboratoire <strong>"${labTitle}"</strong> est maintenant disponible sur votre espace CARYPASS.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/lab-results" style="background-color: #0066CC; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Consulter mes résultats
          </a>
        </div>
        <p>Consultez votre médecin pour l'interprétation de ces résultats.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Résultat de laboratoire disponible — CARYPASS', html);
  }

  async sendAccessRequestEmail(
    to: string,
    firstName: string,
    doctorName: string,
    reason: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Demande d'accès à votre dossier</h2>
        <p>Bonjour ${firstName},</p>
        <p>Le <strong>Dr. ${doctorName}</strong> souhaite accéder à votre dossier médical.</p>
        ${reason ? `<div style="background-color: #f8f9fa; border-left: 4px solid #0066CC; padding: 16px; border-radius: 4px; margin: 20px 0;"><p style="margin: 0;"><strong>Motif :</strong> ${reason}</p></div>` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/access-requests" style="background-color: #0066CC; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Gérer la demande
          </a>
        </div>
        <p>Vous pouvez accepter ou refuser cette demande depuis votre espace CARYPASS.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Demande d\'accès à votre dossier — CARYPASS', html);
  }

  async sendAccessGrantedEmail(
    to: string,
    firstName: string,
    patientName: string,
    expiresAt: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Accès accordé</h2>
        <p>Bonjour Dr. ${firstName},</p>
        <p><strong>${patientName}</strong> vous a accordé l'accès à son dossier médical.</p>
        ${expiresAt ? `<p>Cet accès est valable jusqu'au <strong>${expiresAt}</strong>.</p>` : '<p>Cet accès est valable jusqu\'à révocation par le patient.</p>'}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/patients" style="background-color: #0066CC; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Accéder au dossier
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Accès au dossier patient accordé — CARYPASS', html);
  }

  async sendConsultationSummaryEmail(
    to: string,
    firstName: string,
    doctorName: string,
    date: string,
    diagnosis: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Résumé de consultation</h2>
        <p>Bonjour ${firstName},</p>
        <p>Voici le résumé de votre consultation :</p>
        <div style="background-color: #f8f9fa; border-left: 4px solid #0066CC; padding: 16px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Médecin :</strong> Dr. ${doctorName}</p>
          <p style="margin: 4px 0;"><strong>Date :</strong> ${date}</p>
          <p style="margin: 4px 0;"><strong>Diagnostic :</strong> ${diagnosis}</p>
        </div>
        <p>Retrouvez tous les détails de cette consultation sur votre espace CARYPASS.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Résumé de consultation — CARYPASS', html);
  }

  async sendSubscriptionConfirmationEmail(
    to: string,
    firstName: string,
    planName: string,
    endDate: string,
    amount: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Confirmation d'abonnement</h2>
        <p>Bonjour ${firstName},</p>
        <p>Votre abonnement a été confirmé avec succès.</p>
        <div style="background-color: #f8f9fa; border-left: 4px solid #0066CC; padding: 16px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Plan :</strong> ${planName}</p>
          <p style="margin: 4px 0;"><strong>Montant :</strong> ${amount}</p>
          <p style="margin: 4px 0;"><strong>Valable jusqu'au :</strong> ${endDate}</p>
        </div>
        <p>Merci pour votre confiance !</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Confirmation d\'abonnement — CARYPASS', html);
  }

  async sendTwoFactorCodeEmail(
    to: string,
    firstName: string,
    code: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Code de vérification</h2>
        <p>Bonjour ${firstName},</p>
        <p>Votre code de vérification à deux facteurs est :</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="background-color: #f8f9fa; border: 2px solid #0066CC; padding: 16px 32px; border-radius: 8px; font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #0066CC;">
            ${code}
          </span>
        </div>
        <p>Ce code expirera dans <strong>10 minutes</strong>.</p>
        <p>Si vous n'avez pas demandé ce code, veuillez sécuriser votre compte immédiatement.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Code de vérification — CARYPASS', html);
  }

  async sendCustomEmail(to: string, subject: string, html: string): Promise<void> {
    return this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
      this.logger.debug(`[EMAIL MOCK] Body: ${html.substring(0, 200)}...`);
      return;
    }

    try {
      this.logger.log(`Sending email to ${to} from ${this.fromEmail} | Subject: ${subject}`);
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send email to ${to}: ${JSON.stringify(error)}`);
        this.logger.error(`Resend error details — name: ${(error as any).name}, message: ${(error as any).message}`);
        return;
      }

      this.logger.log(`Email sent successfully to ${to} — ID: ${data?.id}`);
    } catch (error) {
      this.logger.error(`Email sending exception: ${error instanceof Error ? error.message : error}`);
    }
  }
}
