import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SensorsService, SensorReportDto } from './sensors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, ADMIN_PM_ROLES } from '../../common/decorators/roles.decorator';

@Controller('sensors')
export class SensorsController {
  constructor(private sensorsService: SensorsService) {}

  /** PM scope: their property ids, or a never-matching sentinel when unassigned. */
  private pmScope(user: any): string[] | undefined {
    if (user.role !== 'PROPERTY_MANAGER') return undefined;
    return user.propertyIds?.length ? user.propertyIds : ['__none__'];
  }

  @Public()
  @Post(':deviceCode/report')
  report(@Param('deviceCode') deviceCode: string, @Body() dto: SensorReportDto) {
    return this.sensorsService.report(deviceCode, dto);
  }

  @Public()
  @Get(':deviceCode/diagnose')
  diagnose(@Param('deviceCode') deviceCode: string) {
    return this.sensorsService.diagnose(deviceCode);
  }

  @UseGuards(JwtAuthGuard)
  @Get('summary')
  orgSummary(@CurrentUser() user: any) {
    // Property managers only see the sensors of their own properties
    return this.sensorsService.orgSummary(user.orgId, this.pmScope(user));
  }

  @Roles(...ADMIN_PM_ROLES)
  @UseGuards(JwtAuthGuard)
  @Patch('devices/:deviceId/config')
  updateConfig(
    @CurrentUser() user: any,
    @Param('deviceId') deviceId: string,
    @Body() dto: { occupiedAfterSec?: number; emptyAfterSec?: number },
  ) {
    return this.sensorsService.updateConfig(deviceId, dto, { orgId: user.orgId, propertyIds: this.pmScope(user) });
  }

  @UseGuards(JwtAuthGuard)
  @Get('restrooms/:restroomId/summary')
  restroomSummary(@CurrentUser() user: any, @Param('restroomId') restroomId: string) {
    return this.sensorsService.restroomSummary(restroomId, { orgId: user.orgId, propertyIds: this.pmScope(user) });
  }

  @UseGuards(JwtAuthGuard)
  @Get('restrooms/:restroomId/events')
  eventLog(
    @CurrentUser() user: any,
    @Param('restroomId') restroomId: string,
    @Query('limit') limit?: string,
  ) {
    return this.sensorsService.eventLog(
      restroomId,
      { limit: limit ? Number(limit) : undefined },
      { orgId: user.orgId, propertyIds: this.pmScope(user) },
    );
  }
}
