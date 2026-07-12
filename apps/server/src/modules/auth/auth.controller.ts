import { Controller, Post, Body, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AdminLoginDto, CleanerLoginDto, RefreshDto } from './auth.dto';

/** 20 attempts per 5 minutes per IP on credential endpoints (brute-force cap). */
const LOGIN_RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

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
  @RateLimit(LOGIN_RATE_LIMIT)
  @Post('admin/login')
  loginAdmin(@Body() body: AdminLoginDto) {
    return this.authService.loginAdmin(body.email, body.password);
  }

  @Public()
  @RateLimit(LOGIN_RATE_LIMIT)
  @Post('cleaner/login')
  loginCleaner(@Body() body: CleanerLoginDto) {
    return this.authService.loginCleaner(body.orgId, body.idNumber);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: RefreshDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  /** Revoke the refresh session server-side. Called on logout so a copied token dies. */
  @Public()
  @Post('logout')
  logout(@Body() body: RefreshDto) {
    return this.authService.logout(body.refreshToken);
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
  @Patch('kiosk/:deviceCode/restroom')
  reassignDevice(
    @Param('deviceCode') deviceCode: string,
    @Body() body: { restroomId: string },
  ) {
    return this.authService.reassignDevice(deviceCode, body.restroomId);
  }
}
