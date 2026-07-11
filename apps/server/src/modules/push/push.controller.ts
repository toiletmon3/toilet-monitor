import { Controller, Post, Delete, Body, Get, UseGuards } from '@nestjs/common';
import { PushService } from './push.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, ADMIN_ROLES } from '../../common/decorators/roles.decorator';

@Controller('push')
export class PushController {
  constructor(private pushService: PushService) {}

  /** Return the VAPID public key so the browser can create a subscription */
  @Public()
  @Get('vapid-public-key')
  getVapidKey() {
    return { key: process.env.VAPID_PUBLIC_KEY ?? '' };
  }

  /** Register / update a push subscription */
  @Public()
  @Post('subscribe')
  subscribe(
    @Body() body: { userId: string; orgId: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } },
  ) {
    return this.pushService.subscribe(body.userId, body.orgId, body.subscription);
  }

  /** Remove a push subscription (called on logout or permission revoke) */
  @Public()
  @Delete('subscribe')
  unsubscribe(@Body() body: { endpoint: string }) {
    return this.pushService.unsubscribe(body.endpoint);
  }

  /** Push readiness overview — VAPID status + per-user subscriptions (redacted).
   *  Admin-only and scoped to the caller's org (was a public cross-tenant roster leak). */
  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('diagnose')
  diagnose(@CurrentUser() user: any) {
    return this.pushService.diagnose(user.orgId);
  }

  /** Send a real test notification to this org's subscribed devices and report per-device results.
   *  Admin-only and org-scoped (was public: anyone could blast every device in every org). */
  @Roles(...ADMIN_ROLES)
  @UseGuards(JwtAuthGuard)
  @Get('test')
  test(@CurrentUser() user: any) {
    return this.pushService.sendTestToAll(user.orgId);
  }

  /**
   * Carry a subscription over to a new endpoint after the browser rotates it.
   * Called by the service worker's `pushsubscriptionchange` handler.
   */
  @Public()
  @Post('rotate')
  rotate(
    @Body() body: { oldEndpoint?: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } },
  ) {
    return this.pushService.rotate(body.oldEndpoint, body.subscription);
  }
}
