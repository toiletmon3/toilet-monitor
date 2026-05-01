import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;

  constructor(private config: ConfigService) {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const smtpHost = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = parseInt(this.config.get<string>('SMTP_PORT') || '587', 10);
    this.fromAddress = this.config.get<string>('SMTP_FROM') || smtpUser || 'noreply@toiletmon.com';

    if (smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.logger.log(`Email configured via SMTP (${smtpHost}:${smtpPort}, user: ${smtpUser})`);
    } else {
      this.logger.warn('SMTP_USER/SMTP_PASS not set — email sending disabled');
    }
  }

  async send(to: string | string[], subject: string, html: string): Promise<boolean> {
    if (!this.transporter) return false;

    try {
      await this.transporter.sendMail({
        from: `ToiletMon <${this.fromAddress}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
      });
      return true;
    } catch (err: any) {
      this.logger.error(`Email send failed: ${err?.message ?? err}`);
      return false;
    }
  }
}
