import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    // Property managers only see the workers of their own properties
    // (or nothing until a property is assigned)
    const scope = user.role === 'PROPERTY_MANAGER' ? (user.propertyIds?.length ? user.propertyIds : ['__none__']) : undefined;
    return this.usersService.findAll(user.orgId, scope);
  }

  @Post('cleaners')
  createCleaner(
    @CurrentUser() user: any,
    @Body() dto: { name: string; idNumber: string; phone?: string; preferredLang?: string; propertyId?: string },
  ) {
    // Users a property manager creates are stamped with their property
    if (user.role === 'PROPERTY_MANAGER') dto.propertyId = user.propertyIds?.[0] ?? undefined;
    return this.usersService.createCleaner(user.orgId, dto);
  }

  @Post('admins')
  createAdmin(
    @CurrentUser() user: any,
    @Body() dto: { name: string; email: string; password: string; role?: string; propertyId?: string },
  ) {
    if (user.role === 'PROPERTY_MANAGER') {
      // A property manager can only add WORKERS — shift supervisors here
      // (cleaners go through /cleaners) — never other managers.
      if (dto.role !== 'SHIFT_SUPERVISOR') {
        throw new ForbiddenException('Property managers cannot create managers');
      }
      dto.propertyId = user.propertyIds?.[0] ?? undefined;
    }
    return this.usersService.createAdmin(user.orgId, dto);
  }

  @Patch(':id/properties')
  setManagedProperties(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { propertyIds: string[] }) {
    if (user.role === 'PROPERTY_MANAGER') throw new ForbiddenException();
    return this.usersService.setManagedProperties(id, dto.propertyIds ?? []);
  }

  // Literal routes MUST come before parameterized ':id' routes in NestJS
  @Get('org-settings')
  getOrgSettings(@CurrentUser() user: any) {
    return this.usersService.getOrgSettings(user.orgId);
  }

  @Patch('org-settings')
  updateOrgSettings(@CurrentUser() user: any, @Body() dto: { name?: string; kioskLang?: string; cleanerLang?: string | null; timezone?: string; dailyReportHour?: number; dailyReportEnabled?: boolean }) {
    return this.usersService.updateOrgSettings(user.orgId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mismatches')
  getMismatches(@CurrentUser() user: any) {
    return this.usersService.getMismatches(user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('escalation-config')
  getEscalationConfig(@CurrentUser() user: any) {
    return this.usersService.getEscalationConfig(user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('escalation-config')
  updateEscalationConfig(
    @CurrentUser() user: any,
    @Body() dto: { escalationEnabled?: boolean; cleanerReminderMinutes?: number; supervisorEscalationMinutes?: number; mismatchThresholdMinutes?: number },
  ) {
    return this.usersService.updateEscalationConfig(user.orgId, dto);
  }

  @Patch(':id')
  async updateWorker(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { name?: string; idNumber?: string; phone?: string }) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.updateWorker(id, dto);
  }

  @Patch(':id/password')
  async changePassword(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { password: string }) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.changePassword(id, dto.password);
  }

  @Patch(':id/admin')
  async updateAdmin(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { name?: string; email?: string; idNumber?: string; preferredLang?: string }) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.updateAdmin(id, dto);
  }

  @Public()
  @Post('verify-admin')
  verifyAdmin(@Body() dto: { idNumber: string }) {
    return this.usersService.verifyAdminByIdNumber(dto.idNumber);
  }

  @Patch(':id/toggle')
  async toggleActive(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { isActive: boolean }) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.toggleActive(id, dto.isActive);
  }

  @Patch(':id/building')
  async assignBuilding(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { buildingId: string | null }) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.assignBuilding(id, dto.buildingId);
  }

  @Public()
  @Post('verify-cleaner')
  verifyCleaner(@Body() dto: { idNumber: string }) {
    return this.usersService.verifyCleaner(dto.idNumber);
  }

  @Public()
  @Post('checkin')
  checkin(@Body() dto: { cleanerIdNumber: string; restroomId?: string; buildingId?: string; note?: string }) {
    return this.usersService.checkin(dto);
  }

  @Public()
  @Post('checkout')
  checkout(@Body() dto: { cleanerIdNumber: string }) {
    return this.usersService.checkout(dto.cleanerIdNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-cleaners')
  getActiveCleaners(@CurrentUser() user: any) {
    return this.usersService.getActiveCleaners(user.orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('arrivals')
  getArrivals(@CurrentUser() user: any, @Query('from') from?: string) {
    return this.usersService.getArrivals(user.orgId, from);
  }

  @Delete(':id')
  async deleteUser(@CurrentUser() user: any, @Param('id') id: string) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.deleteUser(id);
  }

  @Patch(':id/lang')
  updateLang(@Param('id') id: string, @Body() dto: { preferredLang: string }) {
    return this.usersService.updateLang(id, dto.preferredLang);
  }

}
