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
  getStatus() {
    return {
      configured: this.emailService.isConfigured(),
      lastError: this.emailService.getLastError(),
    };
  }

  @Post('send-daily-report')
  async sendDailyReport(@CurrentUser() user: any) {
    if (!this.emailService.isConfigured()) {
      return { sent: false, error: 'SMTP not configured on server (SMTP_USER/SMTP_PASS missing)', recipients: [] };
    }
    const result = await this.dailyReport.sendNow(user.orgId);
    if (!result.sent) {
      return { ...result, error: this.emailService.getLastError() || 'No admin recipients found' };
    }
    return result;
  }
}
