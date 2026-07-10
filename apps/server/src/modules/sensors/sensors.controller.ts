import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { SensorsService, SensorReportDto } from './sensors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('sensors')
export class SensorsController {
  constructor(private sensorsService: SensorsService) {}

  @Public()
  @Post(':deviceCode/report')
  report(@Param('deviceCode') deviceCode: string, @Body() dto: SensorReportDto) {
    return this.sensorsService.report(deviceCode, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('restrooms/:restroomId/summary')
  restroomSummary(@Param('restroomId') restroomId: string) {
    return this.sensorsService.restroomSummary(restroomId);
  }
}
