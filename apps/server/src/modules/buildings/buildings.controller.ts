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
    return this.buildingsService.getStructure(user.orgId);
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
  @Patch(':buildingId')
  updateBuilding(@Param('buildingId') buildingId: string, @Body() dto: { name?: string; address?: string }) {
    return this.buildingsService.updateBuilding(buildingId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('floors/:floorId')
  updateFloor(@Param('floorId') floorId: string, @Body() dto: { name?: string; floorNumber?: number }) {
    return this.buildingsService.updateFloor(floorId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('restrooms/:restroomId')
  updateRestroom(@Param('restroomId') restroomId: string, @Body() dto: { name?: string; gender?: string }) {
    return this.buildingsService.updateRestroom(restroomId, dto);
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

  // ── Kiosk templates ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('kiosk-templates')
  getTemplates(@CurrentUser() user: any) {
    return this.buildingsService.getTemplates(user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('kiosk-templates')
  createTemplate(@CurrentUser() user: any, @Body() dto: { name: string }) {
    return this.buildingsService.createTemplate(user.orgId, dto.name);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('kiosk-templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: { name?: string; buttons?: any[]; theme?: string }) {
    return this.buildingsService.updateTemplate(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('kiosk-templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.buildingsService.deleteTemplate(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':buildingId/kiosk-template')
  assignTemplate(@Param('buildingId') buildingId: string, @Body() dto: { templateId: string | null }) {
    return this.buildingsService.assignTemplate(buildingId, dto.templateId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('devices/:deviceId/kiosk-template')
  assignTemplateToDevice(@Param('deviceId') deviceId: string, @Body() dto: { templateId: string | null }) {
    return this.buildingsService.assignTemplateToDevice(deviceId, dto.templateId);
  }

  @Public()
  @Get('kiosk-buttons/:deviceCode')
  getKioskButtons(@Param('deviceCode') deviceCode: string) {
    return this.buildingsService.getKioskButtons(deviceCode);
  }

  @Public()
  @Get('kiosk-config/:deviceCode')
  getKioskConfig(@Param('deviceCode') deviceCode: string) {
    return this.buildingsService.getKioskConfig(deviceCode);
  }

  @Public()
  @Get('public-structure/:orgId')
  getPublicStructure(@Param('orgId') orgId: string) {
    return this.buildingsService.getPublicStructure(orgId);
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
