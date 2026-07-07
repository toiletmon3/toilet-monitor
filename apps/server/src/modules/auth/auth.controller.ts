import { Controller, Post, Body, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Fresh profile of the logged-in user — reflects admin-side changes (e.g. building assignment) without re-login */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }

  @Public()
  @Post('admin/login')
  loginAdmin(@Body() body: { email: string; password: string }) {
    return this.authService.loginAdmin(body.email, body.password);
  }

  @Public()
  @Post('cleaner/login')
  loginCleaner(@Body() body: { orgId: string; idNumber: string }) {
    return this.authService.loginCleaner(body.orgId, body.idNumber);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Public()
  @Get('kiosk/:deviceCode')
  validateKiosk(@Param('deviceCode') deviceCode: string) {
    return this.authService.validateKioskDevice(deviceCode);
  }

  @Public()
  @Get('default-org')
  getDefaultOrg() {
    return this.authService.getDefaultOrg();
  }

  @Public()
  @Get('admin-bypass')
  adminBypass() {
    return this.authService.getAdminBypassToken();
  }

  @Public()
  @Patch('kiosk/:deviceCode/restroom')
  reassignDevice(
    @Param('deviceCode') deviceCode: string,
    @Body() body: { restroomId: string },
  ) {
    return this.authService.reassignDevice(deviceCode, body.restroomId);
  }
}
