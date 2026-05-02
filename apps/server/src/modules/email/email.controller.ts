import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DailyReportService } from './daily-report.service';

@UseGuards(JwtAuthGuard)
@Controller('email')
export class EmailController {
  constructor(private dailyReport: DailyReportService) {}

  @Post('send-daily-report')
  async sendDailyReport(@CurrentUser() user: any) {
    return this.dailyReport.sendNow(user.orgId);
  }
}
