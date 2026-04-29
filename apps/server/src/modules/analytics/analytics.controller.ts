import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Resolves a `[from, to]` date range from query params.
 * Priority:
 *   1. `from` + `to` (ISO strings) when both are valid → use them.
 *   2. otherwise → fall back to `now - days * 24h` … `now`.
 */
function resolveRange(days: string | undefined, from: string | undefined, to: string | undefined, defaultDays: number): { from: Date; to: Date } {
  const tryParse = (s?: string) => {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const fromD = tryParse(from);
  const toD = tryParse(to);
  if (fromD && toD) {
    // Make `to` inclusive end-of-day if user passed only a date
    const inclusiveTo = new Date(toD);
    if (to && !to.includes('T')) inclusiveTo.setHours(23, 59, 59, 999);
    return { from: fromD, to: inclusiveTo };
  }
  const d = days ? +days : defaultDays;
  return { from: new Date(Date.now() - d * 24 * 60 * 60 * 1000), to: new Date() };
}

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: any, @Query('buildingId') buildingId?: string) {
    return this.analyticsService.getSummary(user.orgId, buildingId);
  }

  @Get('issue-frequency')
  getIssueFrequency(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = resolveRange(days, from, to, 30);
    return this.analyticsService.getIssueFrequency(user.orgId, r.from, r.to);
  }

  @Get('hourly')
  getHourlyStats(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = resolveRange(days, from, to, 7);
    return this.analyticsService.getHourlyStats(user.orgId, r.from, r.to);
  }

  @Get('heatmap')
  getHeatmap(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = resolveRange(days, from, to, 30);
    return this.analyticsService.getFloorHeatmap(user.orgId, r.from, r.to);
  }

  @Get('cleaners')
  getCleanerPerformance(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = resolveRange(days, from, to, 30);
    return this.analyticsService.getCleanerPerformance(user.orgId, r.from, r.to);
  }

  @Get('sla')
  getSlaStats(
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('targetMinutes') targetMinutes?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const r = resolveRange(days, from, to, 30);
    return this.analyticsService.getSlaStats(user.orgId, r.from, r.to, targetMinutes ? +targetMinutes : 15);
  }

  @Get('day-of-week')
  getDayOfWeek(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = resolveRange(days, from, to, 30);
    return this.analyticsService.getDayOfWeekStats(user.orgId, r.from, r.to);
  }

  @Get('patterns')
  getPatterns(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = resolveRange(days, from, to, 30);
    return this.analyticsService.getPatterns(user.orgId, r.from, r.to);
  }

  @Get('trends')
  getHistoricalTrends(
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('buildingId') buildingId?: string,
  ) {
    const r = resolveRange(days, from, to, 365);
    return this.analyticsService.getHistoricalTrends(user.orgId, r.from, r.to, buildingId);
  }

  @Public()
  @Get('kiosk-stats/:restroomId')
  getKioskStats(@Param('restroomId') restroomId: string) {
    return this.analyticsService.getKioskStats(restroomId);
  }
}
