import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
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
    return this.usersService.findAll(user.orgId);
  }

  @Post('cleaners')
  createCleaner(
    @CurrentUser() user: any,
    @Body() dto: { name: string; idNumber: string; phone?: string; preferredLang?: string },
  ) {
    return this.usersService.createCleaner(user.orgId, dto);
  }

  @Post('admins')
  createAdmin(
    @CurrentUser() user: any,
    @Body() dto: { name: string; email: string; password: string; role?: string },
  ) {
    return this.usersService.createAdmin(user.orgId, dto);
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: string, @Body() dto: { isActive: boolean }) {
    return this.usersService.toggleActive(id, dto.isActive);
  }

  @Patch(':id/building')
  assignBuilding(@Param('id') id: string, @Body() dto: { buildingId: string | null }) {
    return this.usersService.assignBuilding(id, dto.buildingId);
  }

  @Public()
  @Post('checkin')
  checkin(@Body() dto: { cleanerIdNumber: string; restroomId?: string; buildingId?: string; note?: string }) {
    return this.usersService.checkin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('arrivals')
  getArrivals(@CurrentUser() user: any, @Query('from') from?: string) {
    return this.usersService.getArrivals(user.orgId, from);
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Patch(':id/lang')
  updateLang(@Param('id') id: string, @Body() dto: { preferredLang: string }) {
    return this.usersService.updateLang(id, dto.preferredLang);
  }

  @Get('org-settings')
  getOrgSettings(@CurrentUser() user: any) {
    return this.usersService.getOrgSettings(user.orgId);
  }

  @Patch('org-settings')
  updateOrgSettings(@CurrentUser() user: any, @Body() dto: { kioskLang?: string; cleanerLang?: string | null }) {
    return this.usersService.updateOrgSettings(user.orgId, dto);
  }
}
