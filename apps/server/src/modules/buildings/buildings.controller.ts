import { Controller, Get, Post, Delete, Body, Param, UseGuards, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
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
    // A property manager only ever sees the buildings of their own properties;
    // one with none assigned yet sees nothing (never everything).
    const scope = user.role === 'PROPERTY_MANAGER' ? (user.propertyIds?.length ? user.propertyIds : ['__none__']) : undefined;
    return this.buildingsService.getStructure(user.orgId, scope);
  }

  // ── Properties (נכסים) ───────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('properties')
  getProperties(@CurrentUser() user: any) {
    // A property manager only sees their own properties (or nothing if unassigned)
    const scope = user.role === 'PROPERTY_MANAGER' ? (user.propertyIds?.length ? user.propertyIds : ['__none__']) : undefined;
    return this.buildingsService.getProperties(user.orgId, scope);
  }

  @UseGuards(JwtAuthGuard)
  @Post('properties')
  createProperty(@CurrentUser() user: any, @Body() dto: { name: string }) {
    return this.buildingsService.createProperty(user.orgId, dto.name);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('properties/:id')
  updateProperty(@Param('id') id: string, @Body() dto: { name: string }) {
    return this.buildingsService.updateProperty(id, dto.name);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('properties/:id')
  deleteProperty(@CurrentUser() user: any, @Param('id') id: string) {
    return this.buildingsService.deleteProperty(id, user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':buildingId/property')
  assignBuildingToProperty(@Param('buildingId') buildingId: string, @Body() dto: { propertyId: string | null }) {
    return this.buildingsService.assignBuildingToProperty(buildingId, dto.propertyId ?? null);
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
  deleteBuilding(@CurrentUser() user: any, @Param('buildingId') buildingId: string) {
    return this.buildingsService.deleteBuilding(buildingId, user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('floors/:floorId')
  deleteFloor(@CurrentUser() user: any, @Param('floorId') floorId: string) {
    return this.buildingsService.deleteFloor(floorId, user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('restrooms/:restroomId')
  deleteRestroom(@CurrentUser() user: any, @Param('restroomId') restroomId: string) {
    return this.buildingsService.deleteRestroom(restroomId, user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('devices/:deviceId')
  deleteDevice(@CurrentUser() user: any, @Param('deviceId') deviceId: string) {
    return this.buildingsService.deleteDevice(deviceId, user.orgId);
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
  updateTemplate(@Param('id') id: string, @Body() dto: { name?: string; buttons?: any[]; theme?: string; iconScale?: number; ledSnake?: boolean; statsLayout?: any }) {
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
  @Get('kiosk-diagnose')
  kioskDiagnose() {
    return this.buildingsService.kioskDiagnose();
  }

  @Public()
  @Get('public-structure/:orgId')
  getPublicStructure(@Param('orgId') orgId: string) {
    return this.buildingsService.getPublicStructure(orgId);
  }

  @Public()
  @Patch('devices/:deviceCode/heartbeat')
  heartbeat(@Param('deviceCode') deviceCode: string, @Req() req: Request) {
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
    return this.buildingsService.heartbeat(deviceCode, host);
  }

  @Public()
  @Get('issue-types/:orgId')
  getIssueTypes(@Param('orgId') orgId: string) {
    return this.buildingsService.getIssueTypes(orgId);
  }
}
