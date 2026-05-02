import { Controller, Post, Get, UseGuards, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DailyReportService } from './daily-report.service';
import { EmailService } from './email.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('email')
export class EmailController {
  constructor(
    private dailyReport: DailyReportService,
    private emailService: EmailService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus() {
    const configured = this.emailService.isConfigured();
    const verify = configured ? await this.emailService.verify() : { ok: false, error: 'Not configured' };
    return {
      configured,
      smtpConnection: verify.ok ? 'OK' : verify.error,
      lastError: this.emailService.getLastError(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-daily-report')
  async sendDailyReport(@CurrentUser() user: any) {
    if (!this.emailService.isConfigured()) {
      return { sent: false, error: 'SMTP not configured on server (SMTP_USER/SMTP_PASS missing)', recipients: [] };
    }
    const verify = await this.emailService.verify();
    if (!verify.ok) {
      return { sent: false, error: `SMTP connection failed: ${verify.error}`, recipients: [] };
    }
    const result = await this.dailyReport.sendNow(user.orgId);
    if (!result.sent) {
      return { ...result, error: this.emailService.getLastError() || 'No admin recipients found with email' };
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('trigger-daily-report')
  async triggerDailyReport(@CurrentUser() user: any) {
    const ghToken = this.config.get<string>('GITHUB_PAT');
    if (!ghToken) {
      return { sent: false, error: 'GITHUB_PAT not configured — cannot trigger workflow' };
    }

    const report = await this.dailyReport.generateReport(user.orgId);
    const recipients = report?.recipients ?? [];

    try {
      const res = await fetch(
        'https://api.github.com/repos/toiletmon3/toilet-monitor/actions/workflows/daily-report.yml/dispatches',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main' }),
        },
      );
      if (res.status === 204) {
        return { sent: true, recipients };
      }
      const body = await res.text();
      return { sent: false, error: `GitHub API returned ${res.status}: ${body}` };
    } catch (err: any) {
      return { sent: false, error: `GitHub API call failed: ${err?.message}` };
    }
  }

  @Public()
  @Get('generate-report')
  async generateReport(@Headers('x-cron-secret') cronSecret: string) {
    const expectedSecret = this.config.get<string>('CRON_SECRET');
    if (!expectedSecret || cronSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid cron secret');
    }

    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    const reports: { subject: string; html: string; recipients: string[] }[] = [];

    for (const org of orgs) {
      const report = await this.dailyReport.generateReport(org.id);
      if (report && report.recipients.length > 0) {
        reports.push(report);
      }
    }

    return { reports };
  }
}
