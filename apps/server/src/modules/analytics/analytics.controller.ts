import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: any) {
    return this.analyticsService.getSummary(user.orgId);
  }

  @Get('issue-frequency')
  getIssueFrequency(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.analyticsService.getIssueFrequency(user.orgId, days ? +days : 30);
  }

  @Get('hourly')
  getHourlyStats(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.analyticsService.getHourlyStats(user.orgId, days ? +days : 7);
  }

  @Get('heatmap')
  getHeatmap(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.analyticsService.getFloorHeatmap(user.orgId, days ? +days : 30);
  }

  @Get('cleaners')
  getCleanerPerformance(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.analyticsService.getCleanerPerformance(user.orgId, days ? +days : 30);
  }

  @Public()
  @Get('kiosk-stats/:restroomId')
  getKioskStats(@Param('restroomId') restroomId: string) {
    return this.analyticsService.getKioskStats(restroomId);
  }
}
