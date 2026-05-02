import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DailyReportService } from './daily-report.service';
import { EmailService } from './email.service';

@UseGuards(JwtAuthGuard)
@Controller('email')
export class EmailController {
  constructor(
    private dailyReport: DailyReportService,
    private emailService: EmailService,
  ) {}

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
}
