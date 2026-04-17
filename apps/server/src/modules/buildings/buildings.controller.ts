import { Controller, Get, Post, Delete, Body, Param, UseGuards, Patch } from '@nestjs/common';
import { BuildingsService } from './buildings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('buildings')
export class BuildingsController {
  constructor(private buildingsService: BuildingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('structure')
  getStructure(@CurrentUser() user: any) {
    return this.buildingsService.getOrgStructure(user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createBuilding(@CurrentUser() user: any, @Body() dto: { name: string; address?: string }) {
    return this.buildingsService.createBuilding(user.orgId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':buildingId/floors')
  createFloor(@Param('buildingId') buildingId: string, @Body() dto: { floorNumber: number; name: string }) {
    return this.buildingsService.createFloor(buildingId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('floors/:floorId/restrooms')
  createRestroom(
    @Param('floorId') floorId: string,
    @Body() dto: { name: string; gender?: 'MALE' | 'FEMALE' | 'UNISEX' },
  ) {
    return this.buildingsService.createRestroom(floorId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('restrooms/:restroomId/devices')
  registerDevice(@Param('restroomId') restroomId: string, @Body() dto: { deviceCode: string }) {
    return this.buildingsService.registerDevice(restroomId, dto.deviceCode);
  }


  @UseGuards(JwtAuthGuard)
  @Delete(':buildingId')
  deleteBuilding(@Param('buildingId') buildingId: string) {
    return this.buildingsService.deleteBuilding(buildingId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('floors/:floorId')
  deleteFloor(@Param('floorId') floorId: string) {
    return this.buildingsService.deleteFloor(floorId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('restrooms/:restroomId')
  deleteRestroom(@Param('restroomId') restroomId: string) {
    return this.buildingsService.deleteRestroom(restroomId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('devices/:deviceId')
  deleteDevice(@Param('deviceId') deviceId: string) {
    return this.buildingsService.deleteDevice(deviceId);
  }

  @Public()
  @Patch('devices/:deviceCode/heartbeat')
  heartbeat(@Param('deviceCode') deviceCode: string) {
    return this.buildingsService.heartbeat(deviceCode);
  }

  @Public()
  @Get('issue-types/:orgId')
  getIssueTypes(@Param('orgId') orgId: string) {
    return this.buildingsService.getIssueTypes(orgId);
  }
}
