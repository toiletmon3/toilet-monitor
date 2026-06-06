import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { DailyReportService } from './daily-report.service';
import { EmailController } from './email.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [EmailController],
  providers: [EmailService, DailyReportService],
  exports: [EmailService],
})
export class EmailModule {}
