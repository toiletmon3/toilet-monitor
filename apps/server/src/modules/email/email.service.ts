import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LastAttempt {
  at: string;
  recipients: string[];
  subject: string;
  ok: boolean;
  messageId?: string;
  httpStatus?: number;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private lastError: string | null = null;
  private lastAttempt: LastAttempt | null = null;

  private readonly fromAddress: string;
  private readonly gmailUser: string | undefined;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly refreshToken: string | undefined;
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private config: ConfigService) {
    this.gmailUser = this.config.get<string>('GMAIL_USER') || this.config.get<string>('SMTP_USER');
    this.clientId = this.config.get<string>('GMAIL_CLIENT_ID');
    this.clientSecret = this.config.get<string>('GMAIL_CLIENT_SECRET');
    this.refreshToken = this.config.get<string>('GMAIL_REFRESH_TOKEN');
    this.fromAddress = this.config.get<string>('SMTP_FROM') || this.gmailUser || 'noreply@toiletmon.com';

    if (this.gmailUser && this.clientId && this.clientSecret && this.refreshToken) {
      this.logger.log(`Email configured via Gmail API (user: ${this.gmailUser})`);
    } else {
      const missing: string[] = [];
      if (!this.gmailUser) missing.push('GMAIL_USER');
      if (!this.clientId) missing.push('GMAIL_CLIENT_ID');
      if (!this.clientSecret) missing.push('GMAIL_CLIENT_SECRET');
      if (!this.refreshToken) missing.push('GMAIL_REFRESH_TOKEN');
      this.logger.warn(`Gmail API not configured — missing: ${missing.join(', ')}`);
    }
  }

  isConfigured(): boolean {
    return !!(this.gmailUser && this.clientId && this.clientSecret && this.refreshToken);
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getLastAttempt(): LastAttempt | null {
    return this.lastAttempt;
  }

  getConfigStatus() {
    const mask = (v?: string) => (v ? `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})` : null);
    return {
      gmailUser: this.gmailUser ?? null,
      fromAddress: this.fromAddress,
      hasClientId: !!this.clientId,
      hasClientSecret: !!this.clientSecret,
      hasRefreshToken: !!this.refreshToken,
      clientIdPreview: mask(this.clientId),
      refreshTokenPreview: mask(this.refreshToken),
      cachedAccessTokenValid: !!this.cachedAccessToken && Date.now() < this.tokenExpiresAt,
    };
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Gmail API not configured' };
    try {
      await this.getAccessToken();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  async send(to: string | string[], subject: string, html: string): Promise<boolean> {
    const recipients = Array.isArray(to) ? to : [to];
    const at = new Date().toISOString();

    if (!this.isConfigured()) {
      this.lastError = 'Gmail API not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN required)';
      this.lastAttempt = { at, recipients, subject, ok: false, error: this.lastError };
      return false;
    }

    this.logger.log(`Sending email to: ${recipients.join(', ')} | subject: ${subject} | from: ${this.fromAddress}`);

    let httpStatus: number | undefined;
    try {
      const accessToken = await this.getAccessToken();

      const rawEmail = this.buildRawEmail(recipients, subject, html);
      const base64Email = Buffer.from(rawEmail)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: base64Email }),
        },
      );
      httpStatus = res.status;

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gmail API ${res.status}: ${body}`);
      }

      const data = await res.json();
      this.lastError = null;
      this.lastAttempt = { at, recipients, subject, ok: true, messageId: data.id, httpStatus };
      this.logger.log(`Email sent successfully to: ${recipients.join(', ')} (id: ${data.id})`);
      return true;
    } catch (err: any) {
      this.lastError = err?.message ?? String(err);
      this.lastAttempt = { at, recipients, subject, ok: false, error: this.lastError, httpStatus };
      this.logger.error(`Email send failed: ${this.lastError}`);
      return false;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedAccessToken;
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        refresh_token: this.refreshToken!,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OAuth2 token refresh failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return data.access_token;
  }

  private buildRawEmail(to: string[], subject: string, html: string): string {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const lines = [
      `From: ToiletMon <${this.fromAddress}>`,
      `To: ${to.join(', ')}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html).toString('base64'),
      '',
      `--${boundary}--`,
    ];
    return lines.join('\r\n');
  }
}
