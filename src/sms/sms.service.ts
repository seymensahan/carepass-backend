import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly senderAddress: string;
  private readonly simulationMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('ORANGE_SMS_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('ORANGE_SMS_CLIENT_SECRET');
    this.senderAddress =
      this.configService.get<string>('ORANGE_SMS_SENDER') || 'tel:+237XXXXXXXXX';

    this.simulationMode = !this.clientId || !this.clientSecret;

    if (this.simulationMode) {
      this.logger.warn(
        'ORANGE_SMS_CLIENT_ID ou ORANGE_SMS_CLIENT_SECRET non configuré. Mode simulation activé.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC
  // ---------------------------------------------------------------------------

  /**
   * Generate a 6-digit OTP code and send it via SMS.
   * Returns the plain-text code so the caller can hash and store it.
   */
  async sendOtp(phoneNumber: string): Promise<{ code: string }> {
    const code = this.generateCode();
    const normalized = this.normalizePhone(phoneNumber);
    const message = `Votre code CARYPASS: ${code}`;

    if (this.simulationMode) {
      this.logger.log(
        `[SIMULATION] SMS envoyé à ${normalized} : ${message}`,
      );
      return { code };
    }

    await this.sendSms(normalized, message);
    return { code };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE – Orange SMS API
  // ---------------------------------------------------------------------------

  private async sendSms(phone: string, message: string): Promise<void> {
    const token = await this.getAccessToken();
    const senderUri = this.senderAddress.startsWith('tel:')
      ? this.senderAddress
      : `tel:${this.senderAddress}`;
    const recipientUri = phone.startsWith('tel:') ? phone : `tel:+${phone}`;

    const url = `https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(senderUri)}/requests`;

    const body = {
      outboundSMSMessageRequest: {
        address: recipientUri,
        senderAddress: senderUri,
        outboundSMSTextMessage: { message },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Orange SMS API error (${res.status}): ${text}`);
      throw new Error(`Échec de l'envoi du SMS: ${res.status}`);
    }

    this.logger.log(`SMS envoyé à ${phone}`);
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s safety margin)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const res = await fetch('https://api.orange.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Orange OAuth error (${res.status}): ${text}`);
      throw new Error('Impossible d\'obtenir un token Orange SMS');
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    this.logger.log('Orange SMS OAuth token refreshed');
    return this.accessToken;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private generateCode(): string {
    // Cryptographically random 6-digit code
    const array = new Uint32Array(1);
    require('crypto').getRandomValues(array);
    return String(array[0] % 1_000_000).padStart(6, '0');
  }

  private normalizePhone(phone: string): string {
    // Strip all non-digit characters
    let digits = phone.replace(/\D/g, '');

    // If it starts with '00', remove the leading zeros
    if (digits.startsWith('00')) {
      digits = digits.substring(2);
    }

    // If it doesn't start with a country code, assume Cameroon (+237)
    if (digits.length <= 9 && !digits.startsWith('237')) {
      digits = `237${digits}`;
    }

    return digits;
  }
}
