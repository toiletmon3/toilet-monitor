import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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

  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
