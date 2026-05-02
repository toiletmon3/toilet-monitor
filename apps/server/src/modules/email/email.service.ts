import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;
  private lastError: string | null = null;

  constructor(private config: ConfigService) {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const smtpHost = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = parseInt(this.config.get<string>('SMTP_PORT') || '465', 10);
    this.fromAddress = this.config.get<string>('SMTP_FROM') || smtpUser || 'noreply@toiletmon.com';

    if (smtpUser && smtpPass) {
      const passClean = smtpPass.replace(/\s/g, '');

      if (smtpHost === 'smtp.gmail.com') {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: smtpUser, pass: passClean },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });
      } else {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: passClean },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });
      }
      this.logger.log(`Email configured via SMTP (${smtpHost}, user: ${smtpUser})`);
    } else {
      this.logger.warn(`SMTP not configured — user: ${smtpUser ? 'set' : 'MISSING'}, pass: ${smtpPass ? 'set' : 'MISSING'}`);
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async send(to: string | string[], subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.lastError = 'SMTP not configured (SMTP_USER or SMTP_PASS missing)';
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `ToiletMon <${this.fromAddress}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
      });
      this.lastError = null;
      return true;
    } catch (err: any) {
      this.lastError = err?.message ?? String(err);
      this.logger.error(`Email send failed: ${this.lastError}`);
      return false;
    }
  }
}
