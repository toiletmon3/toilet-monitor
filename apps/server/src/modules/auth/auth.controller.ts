import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
}
