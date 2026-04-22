import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY not set — email sending disabled');
    }
  }

  async send(to: string | string[], subject: string, html: string): Promise<boolean> {
    if (!this.resend) return false;

    try {
      const { error } = await this.resend.emails.send({
        from: 'ToiletMon <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });
      if (error) {
        this.logger.error(`Email send failed: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('Email send error:', err);
      return false;
    }
  }
}
