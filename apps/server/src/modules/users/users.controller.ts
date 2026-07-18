import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, ADMIN_ROLES, ADMIN_PM_ROLES } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

// Every guarded route here is an admin/staff-management surface; only the
// @Public() routes (verify-*/checkin/checkout, used by the anonymous kiosk) are
// reachable without a staff role. This blocks a CLEANER/SHIFT_SUPERVISOR token
// (obtained via ID-only login) from creating admins or managing other users.
@Roles(...ADMIN_PM_ROLES)
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    // Property managers only see the workers of their own properties
    // (or nothing until a property is assigned). They also never see
    // admin/manager accounts — those exist only for the org admins.
    const isPm = user.role === 'PROPERTY_MANAGER';
    const scope = isPm ? (user.propertyIds?.length ? user.propertyIds : ['__none__']) : undefined;
    return this.usersService.findAll(user.orgId, scope, isPm);
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

  /** PM scope helper: their property ids, or a never-matching sentinel when unassigned. */
  private pmScope(user: any): string[] | undefined {
    if (user.role !== 'PROPERTY_MANAGER') return undefined;
    return user.propertyIds?.length ? user.propertyIds : ['__none__'];
  }

  // Literal routes MUST come before parameterized ':id' routes in NestJS
  @Get('org-settings')
  getOrgSettings(@CurrentUser() user: any) {
    // A property manager reads the daily-report settings of their own property
    return this.usersService.getOrgSettings(user.orgId, user.role === 'PROPERTY_MANAGER' ? (user.propertyIds ?? []) : undefined);
  }

  @Patch('org-settings')
  updateOrgSettings(@CurrentUser() user: any, @Body() dto: { name?: string; kioskLang?: string; cleanerLang?: string | null; timezone?: string; dailyReportHour?: number; dailyReportEnabled?: boolean }) {
    // A property manager may only tune the daily report of their own property —
    // never org-wide settings (name, languages, timezone).
    return this.usersService.updateOrgSettings(user.orgId, dto, user.role === 'PROPERTY_MANAGER' ? (user.propertyIds ?? []) : undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mismatches')
  getMismatches(@CurrentUser() user: any) {
    return this.usersService.getMismatches(user.orgId, this.pmScope(user));
  }

  // Escalation & notification policy is org-wide — general admins only,
  // never property managers.
  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('escalation-config')
  getEscalationConfig(@CurrentUser() user: any) {
    return this.usersService.getEscalationConfig(user.orgId);
  }

  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Patch('escalation-config')
  updateEscalationConfig(
    @CurrentUser() user: any,
    @Body() dto: { escalationEnabled?: boolean; cleanerReminderMinutes?: number; supervisorEscalationMinutes?: number; mismatchThresholdMinutes?: number },
  ) {
    return this.usersService.updateEscalationConfig(user.orgId, dto);
  }

  // Visibility of internal accounts in property-manager views — general
  // admins only. A property manager must never learn this flag even exists.
  @Roles(...ADMIN_ROLES)
  @Patch(':id/hidden')
  setHidden(@Param('id') id: string, @Body() dto: { hiddenFromPm: boolean }) {
    return this.usersService.setHiddenFromPm(id, !!dto.hiddenFromPm);
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

  // Higher cap than the login routes: these are called from the shared-IP kiosk
  // during check-in, but still tight enough to stop rapid ID enumeration.
  @Public()
  @RateLimit({ limit: 60, windowMs: 5 * 60 * 1000 })
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
  @RateLimit({ limit: 60, windowMs: 5 * 60 * 1000 })
  @Post('verify-cleaner')
  verifyCleaner(@Body() dto: { idNumber: string; deviceCode?: string }) {
    return this.usersService.verifyCleaner(dto.idNumber, dto.deviceCode);
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

  // Roster of the kiosk's building staff, cached by the tablet while online so
  // any assigned worker can identify themselves during an internet outage — even
  // on a tablet they've never personally logged into. Scoped to one building by
  // the (physically printed) deviceCode, same trust level as the other kiosk
  // config endpoints.
  @Public()
  @RateLimit({ limit: 60, windowMs: 5 * 60 * 1000 })
  @Get('kiosk-roster/:deviceCode')
  kioskRoster(@Param('deviceCode') deviceCode: string) {
    return this.usersService.kioskRoster(deviceCode);
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-cleaners')
  getActiveCleaners(@CurrentUser() user: any) {
    return this.usersService.getActiveCleaners(user.orgId, this.pmScope(user));
  }

  @UseGuards(JwtAuthGuard)
  @Get('arrivals')
  getArrivals(@CurrentUser() user: any, @Query('from') from?: string) {
    return this.usersService.getArrivals(user.orgId, from, this.pmScope(user));
  }

  @Delete(':id')
  async deleteUser(@CurrentUser() user: any, @Param('id') id: string) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.deleteUser(id);
  }

  @Patch(':id/lang')
  async updateLang(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { preferredLang: string }) {
    await this.usersService.assertCanManageUser(user, id);
    return this.usersService.updateLang(id, dto.preferredLang);
  }

}
