import { Controller, Get, Post, Delete, Body, Param, UseGuards, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BuildingsService } from './buildings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, ADMIN_ROLES, ADMIN_PM_ROLES, ALL_ROLES } from '../../common/decorators/roles.decorator';

// Admin/PM by default for the whole controller. The two exceptions below are:
//   - @Public() routes (kiosk config/heartbeat/public-structure) — RolesGuard skips them.
//   - getStructure — the cleaner & supervisor apps read it, so it stays open to all roles.
@Roles(...ADMIN_PM_ROLES)
@Controller('buildings')
export class BuildingsController {
  constructor(private buildingsService: BuildingsService) {}

  @Roles(...ALL_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('structure')
  getStructure(@CurrentUser() user: any) {
    // A property manager only ever sees the buildings of their own properties;
    // one with none assigned yet sees nothing (never everything).
    const scope = user.role === 'PROPERTY_MANAGER' ? (user.propertyIds?.length ? user.propertyIds : ['__none__']) : undefined;
    return this.buildingsService.getStructure(user.orgId, scope);
  }

  /** PM scope: their property ids, or a never-matching sentinel when unassigned. */
  private pmScope(user: any): string[] | undefined {
    if (user.role !== 'PROPERTY_MANAGER') return undefined;
    return user.propertyIds?.length ? user.propertyIds : ['__none__'];
  }

  // ── Properties (נכסים) ───────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('properties')
  getProperties(@CurrentUser() user: any) {
    // A property manager only sees their own properties (or nothing if unassigned)
    return this.buildingsService.getProperties(user.orgId, this.pmScope(user));
  }

  // Creating/renaming/deleting properties and re-assigning buildings between
  // properties reshapes the whole org — general admins only.
  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Post('properties')
  createProperty(@CurrentUser() user: any, @Body() dto: { name: string }) {
    return this.buildingsService.createProperty(user.orgId, dto.name);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Patch('properties/:id')
  updateProperty(@Param('id') id: string, @Body() dto: { name: string }) {
    return this.buildingsService.updateProperty(id, dto.name);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Delete('properties/:id')
  deleteProperty(@CurrentUser() user: any, @Param('id') id: string) {
    return this.buildingsService.deleteProperty(id, user.orgId);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Patch(':buildingId/property')
  assignBuildingToProperty(@Param('buildingId') buildingId: string, @Body() dto: { propertyId: string | null }) {
    return this.buildingsService.assignBuildingToProperty(buildingId, dto.propertyId ?? null);
  }

  // Per-property alert policy (immediate vs batched) — the "general" manager's
  // per-נכס notification config. General admins only, never property managers.
  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Patch('properties/:id/alert-config')
  updatePropertyAlertConfig(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { alertMode?: 'immediate' | 'batched'; batchIntervalMinutes?: number },
  ) {
    return this.buildingsService.updatePropertyAlertConfig(id, user.orgId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createBuilding(@CurrentUser() user: any, @Body() dto: { name: string; address?: string }) {
    // A building a property manager creates lands inside their own property —
    // otherwise it would fall outside their scope and vanish from their view.
    const propertyId = user.role === 'PROPERTY_MANAGER' ? (user.propertyIds?.[0] ?? null) : undefined;
    return this.buildingsService.createBuilding(user.orgId, dto, propertyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':buildingId/floors')
  async createFloor(@CurrentUser() user: any, @Param('buildingId') buildingId: string, @Body() dto: { floorNumber: number; name: string }) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { buildingId });
    return this.buildingsService.createFloor(buildingId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('floors/:floorId/restrooms')
  async createRestroom(
    @CurrentUser() user: any,
    @Param('floorId') floorId: string,
    @Body() dto: { name: string; gender?: 'MALE' | 'FEMALE' | 'UNISEX' },
  ) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { floorId });
    return this.buildingsService.createRestroom(floorId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('restrooms/:restroomId/devices')
  async registerDevice(@CurrentUser() user: any, @Param('restroomId') restroomId: string, @Body() dto: { deviceCode: string }) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { restroomId });
    return this.buildingsService.registerDevice(restroomId, dto.deviceCode);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':buildingId')
  async updateBuilding(@CurrentUser() user: any, @Param('buildingId') buildingId: string, @Body() dto: { name?: string; address?: string }) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { buildingId });
    return this.buildingsService.updateBuilding(buildingId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('floors/:floorId')
  async updateFloor(@CurrentUser() user: any, @Param('floorId') floorId: string, @Body() dto: { name?: string; floorNumber?: number }) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { floorId });
    return this.buildingsService.updateFloor(floorId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('restrooms/:restroomId')
  async updateRestroom(@CurrentUser() user: any, @Param('restroomId') restroomId: string, @Body() dto: { name?: string; gender?: string }) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { restroomId });
    return this.buildingsService.updateRestroom(restroomId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':buildingId')
  async deleteBuilding(@CurrentUser() user: any, @Param('buildingId') buildingId: string) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { buildingId });
    return this.buildingsService.deleteBuilding(buildingId, user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('floors/:floorId')
  async deleteFloor(@CurrentUser() user: any, @Param('floorId') floorId: string) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { floorId });
    return this.buildingsService.deleteFloor(floorId, user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('restrooms/:restroomId')
  async deleteRestroom(@CurrentUser() user: any, @Param('restroomId') restroomId: string) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { restroomId });
    return this.buildingsService.deleteRestroom(restroomId, user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('devices/:deviceId')
  async deleteDevice(@CurrentUser() user: any, @Param('deviceId') deviceId: string) {
    await this.buildingsService.assertScope(user.orgId, this.pmScope(user), { deviceId });
    return this.buildingsService.deleteDevice(deviceId, user.orgId);
  }

  // ── Kiosk templates — org-wide kiosk look & feel, general admins only ────────

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('kiosk-templates')
  getTemplates(@CurrentUser() user: any) {
    return this.buildingsService.getTemplates(user.orgId);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Post('kiosk-templates')
  createTemplate(@CurrentUser() user: any, @Body() dto: { name: string }) {
    return this.buildingsService.createTemplate(user.orgId, dto.name);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Patch('kiosk-templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: { name?: string; buttons?: any[]; theme?: string; iconScale?: number; ledSnake?: boolean; statsLayout?: any }) {
    return this.buildingsService.updateTemplate(id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Delete('kiosk-templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.buildingsService.deleteTemplate(id);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Patch(':buildingId/kiosk-template')
  assignTemplate(@Param('buildingId') buildingId: string, @Body() dto: { templateId: string | null }) {
    return this.buildingsService.assignTemplate(buildingId, dto.templateId);
  }

  @Roles(...ADMIN_ROLES)
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

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('kiosk-diagnose')
  kioskDiagnose(@CurrentUser() user: any) {
    return this.buildingsService.kioskDiagnose(user.orgId);
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
