import { Controller, Post, Delete, Body, Get } from '@nestjs/common';
import { PushService } from './push.service';
import { Public } from '../../common/decorators/public.decorator';

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
}
