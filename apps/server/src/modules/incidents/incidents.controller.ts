import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { IncidentStatus } from '@prisma/client';

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
    @Query('buildingId') buildingId?: string,
    @Query('floorId') floorId?: string,
    @Query('restroomId') restroomId?: string,
    @Query('assignedCleanerId') assignedCleanerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Cleaners are automatically scoped to their assigned building
    const effectiveBuildingId = user.role === 'CLEANER' && user.buildingId
      ? user.buildingId
      : buildingId;

    return this.incidentsService.findAll(user.orgId, {
      status,
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
  @Patch(':id/admin-update')
  adminUpdate(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { status?: string; assignedCleanerId?: string; note?: string },
  ) {
    return this.incidentsService.adminUpdate(id, user.id, body);
  }
}
