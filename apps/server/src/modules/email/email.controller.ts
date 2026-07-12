import { Controller, Post, Get, UseGuards, Headers, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';

/** Constant-time string compare to avoid leaking the secret via timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, ADMIN_ROLES, ADMIN_PM_ROLES } from '../../common/decorators/roles.decorator';
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

  @Roles(...ADMIN_PM_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus() {
    const configured = this.emailService.isConfigured();
    return {
      configured,
      smtpConnection: configured ? 'OK (Gmail API)' : 'Not configured',
      lastError: this.emailService.getLastError(),
    };
  }

  // Exposes org-wide recipients and every org's schedule — general admins only.
  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('diagnose')
  async diagnose(@CurrentUser() user: any) {
    const configured = this.emailService.isConfigured();
    const config = this.emailService.getConfigStatus();

    let oauth: { ok: boolean; error?: string } = { ok: false, error: 'not configured' };
    if (configured) {
      oauth = await this.emailService.verify();
    }

    const allAdmins = await this.prisma.user.findMany({
      where: { orgId: user.orgId, role: { in: ['ORG_ADMIN', 'SUPER_ADMIN', 'MANAGER'] } },
      select: { email: true, role: true, isActive: true, name: true },
    });
    const eligibleRecipients = allAdmins
      .filter(a => a.isActive && a.email)
      .map(a => a.email!);

    const orgs = await this.prisma.organization.findMany({
      select: { id: true, name: true, settings: true },
    });

    return {
      now: new Date().toISOString(),
      tz: 'Asia/Jerusalem',
      currentJerusalemHour: new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getHours(),
      configured,
      config,
      oauth,
      currentOrgId: user.orgId,
      adminsInOrg: allAdmins,
      eligibleRecipients,
      eligibleCount: eligibleRecipients.length,
      allOrgs: orgs.map(o => ({
        id: o.id,
        name: o.name,
        dailyReportEnabled: (o.settings as any)?.dailyReportEnabled !== false,
        dailyReportHour: (o.settings as any)?.dailyReportHour ?? 7,
      })),
      lastAttempt: this.emailService.getLastAttempt(),
      lastError: this.emailService.getLastError(),
    };
  }

  @Roles(...ADMIN_PM_ROLES)
  @UseGuards(JwtAuthGuard)
  @Post('send-daily-report')
  async sendDailyReport(@CurrentUser() user: any) {
    if (!this.emailService.isConfigured()) {
      return { sent: false, error: 'Gmail API not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN missing)', recipients: [] };
    }
    // A property manager triggers only their own property digest (see sendNow)
    const result = await this.dailyReport.sendNow(user.orgId, { id: user.id, role: user.role });
    if (!result.sent) {
      return { ...result, error: this.emailService.getLastError() || 'No admin recipients found with email' };
    }
    return result;
  }

  @Roles(...ADMIN_ROLES)
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

  // Header-only (never a query param, which would leak the secret into nginx /
  // proxy access logs), compared in constant time.
  @Public()
  @Get('generate-report')
  async generateReport(@Headers('x-cron-secret') cronSecretHeader: string) {
    const expectedSecret = this.config.get<string>('CRON_SECRET');
    if (!expectedSecret || !cronSecretHeader || !safeEqual(cronSecretHeader, expectedSecret)) {
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
