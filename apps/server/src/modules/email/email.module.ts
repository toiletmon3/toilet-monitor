import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { DailyReportService } from './daily-report.service';

@Module({
  providers: [EmailService, DailyReportService],
  exports: [EmailService],
})
export class EmailModule {}
