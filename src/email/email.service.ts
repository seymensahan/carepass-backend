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
      this.logger.log('Resend email service initialized');
    } else {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged to console only');
    }
    this.fromEmail = this.configService.get<string>('EMAIL_FROM', 'CAREPASS <noreply@carepass.cm>');
  }

  async sendPasswordResetEmail(to: string, firstName: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CAREPASS — Réinitialisation du mot de passe</h2>
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
        <p style="color: #888; font-size: 12px;">CAREPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Réinitialisation de votre mot de passe — CAREPASS', html);
  }

  async sendEmailVerification(to: string, firstName: string, verificationToken: string): Promise<void> {
    const verifyUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/verify-email?token=${verificationToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CAREPASS — Vérification de votre email</h2>
        <p>Bonjour ${firstName},</p>
        <p>Bienvenue sur CAREPASS ! Veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #0066CC; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Vérifier mon email
          </a>
        </div>
        <p>Ce lien expirera dans <strong>24 heures</strong>.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CAREPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Vérifiez votre email — CAREPASS', html);
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">Bienvenue sur CAREPASS !</h2>
        <p>Bonjour ${firstName},</p>
        <p>Votre compte CAREPASS a été créé avec succès. Vous pouvez maintenant :</p>
        <ul>
          <li>Gérer votre carnet de santé numérique</li>
          <li>Consulter vos résultats de laboratoire</li>
          <li>Prendre des rendez-vous médicaux</li>
          <li>Partager vos données de santé avec vos médecins</li>
        </ul>
        <p>N'oubliez pas de compléter votre profil pour profiter de toutes les fonctionnalités.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CAREPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.send(to, 'Bienvenue sur CAREPASS !', html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
      this.logger.debug(`[EMAIL MOCK] Body: ${html.substring(0, 200)}...`);
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send email to ${to}: ${JSON.stringify(error)}`);
        return;
      }

      this.logger.log(`Email sent to ${to} — ID: ${data?.id}`);
    } catch (error) {
      this.logger.error(`Email sending error: ${error}`);
    }
  }
}
