import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { IncidentStatus } from '@prisma/client';

/** Resolve a { from?, to? } window from the dashboard range params (days=N OR from+to). */
function resolveUrgentRange(days?: string, from?: string, to?: string): { from?: Date; to?: Date } | null {
  const parse = (s?: string) => { if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };
  const f = parse(from), t = parse(to);
  if (f || t) {
    const inclusiveTo = t && to && !to.includes('T') ? new Date(new Date(t).setHours(23, 59, 59, 999)) : (t ?? undefined);
    return { from: f ?? undefined, to: inclusiveTo };
  }
  if (days) { const n = +days; if (Number.isFinite(n) && n > 0) return { from: new Date(Date.now() - n * 24 * 60 * 60 * 1000) }; }
  return null;
}

@Controller('incidents')
export class IncidentsController {
  constructor(private incidentsService: IncidentsService) {}

  @Public()
  @Post()
  create(
    @Body()
    body: {
      restroomId: string;
      issueTypeId: string;
      deviceId: string;
      reportedAt: string;
      clientId: string;
    },
  ) {
    return this.incidentsService.create(body);
  }

  @Public()
  @Post('sync')
  syncBatch(@Body() body: any) {
    return this.incidentsService.syncBatch(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: IncidentStatus,
    @Query('propertyId') propertyId?: string,
    @Query('buildingId') buildingId?: string,
    @Query('floorId') floorId?: string,
    @Query('restroomId') restroomId?: string,
    @Query('assignedCleanerId') assignedCleanerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const effectiveBuildingId = (user.role === 'CLEANER' || user.role === 'SHIFT_SUPERVISOR') && user.buildingId
      ? user.buildingId
      : buildingId;
    // Property managers are always confined to their own properties' incidents
    // (an unassigned one sees nothing); they may narrow to one of their own.
    const mine: string[] | undefined = user.role === 'PROPERTY_MANAGER'
      ? (user.propertyIds?.length ? user.propertyIds : ['__none__'])
      : undefined;
    const pmNarrowed = mine && propertyId && mine.includes(propertyId);

    return this.incidentsService.findAll(user.orgId, {
      status,
      propertyId: mine ? (pmNarrowed ? propertyId : undefined) : propertyId,
      propertyIds: mine && !pmNarrowed ? mine : undefined,
      buildingId: effectiveBuildingId,
      floorId,
      restroomId,
      assignedCleanerId,
      from,
      to,
      limit: limit ? +limit : undefined,
      offset: offset ? +offset : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('positive-feedback')
  getPositiveFeedback(@CurrentUser() user: any) {
    return this.incidentsService.getPositiveFeedback(user.orgId, user.buildingId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('urgent')
  getUrgent(
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('propertyId') propertyId?: string,
    @Query('buildingId') buildingId?: string,
    @Query('floorId') floorId?: string,
    @Query('restroomId') restroomId?: string,
  ) {
    const range = resolveUrgentRange(days, from, to);
    // Lock scoped roles to their own building/property, mirroring findAll.
    const effectiveBuildingId = (user.role === 'CLEANER' || user.role === 'SHIFT_SUPERVISOR') && user.buildingId
      ? user.buildingId
      : buildingId;
    const mineU: string[] | undefined = user.role === 'PROPERTY_MANAGER'
      ? (user.propertyIds?.length ? user.propertyIds : ['__none__'])
      : undefined;
    const pmNarrowedU = mineU && propertyId && mineU.includes(propertyId);
    return this.incidentsService.getUrgent(user.orgId, {
      propertyId: mineU ? (pmNarrowedU ? propertyId : undefined) : propertyId,
      propertyIds: mineU && !pmNarrowedU ? mineU : undefined,
      buildingId: effectiveBuildingId, floorId, restroomId,
      from: range?.from, to: range?.to,
    });
  }

  @Public()
  @Get('restroom/:restroomId')
  findByRestroom(@Param('restroomId') restroomId: string) {
    return this.incidentsService.findByRestroom(restroomId);
  }

  @Public()
  @Patch(':id/return')
  returnToQueue(
    @Param('id') id: string,
    @Body() body: { cleanerIdNumber: string },
  ) {
    return this.incidentsService.returnToQueue(id, body.cleanerIdNumber);
  }

  @Public()
  @Patch(':id/acknowledge')
  acknowledge(
    @Param('id') id: string,
    @Body() body: { cleanerIdNumber: string },
  ) {
    return this.incidentsService.acknowledge(id, body.cleanerIdNumber);
  }

  @Public()
  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: { cleanerIdNumber: string; notes?: string },
  ) {
    return this.incidentsService.resolve(id, body.cleanerIdNumber, body.notes);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('bulk')
  deleteBulk(
    @CurrentUser() user: any,
    @Query('scope') scope: 'resolved' | 'older' | 'all',
    @Query('olderThanDays') olderThanDays?: string,
  ) {
    return this.incidentsService.deleteBulk(user.orgId, scope, olderThanDays ? +olderThanDays : undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/admin-update')
  adminUpdate(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { status?: string; assignedCleanerId?: string; note?: string },
  ) {
    return this.incidentsService.adminUpdate(id, user.id, body);
  }
}
