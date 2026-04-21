import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      this.logger.warn('VAPID keys not set — push notifications disabled');
      return;
    }
    webpush.setVapidDetails('mailto:admin@toiletmon.app', pub, priv);
    this.logger.log('Web Push ready');
  }

  /** Save (or update) a push subscription for a user */
  async subscribe(userId: string, orgId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId, orgId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { userId, orgId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  }

  /** Remove a push subscription */
  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  /**
   * Send a push notification to all workers & supervisors in the given org
   * that belong to buildingId (or have no building assigned → see everything).
   */
  async sendToBuilding(orgId: string, buildingId: string | null, payload: PushPayload) {
    if (!process.env.VAPID_PUBLIC_KEY) return; // push not configured

    // Find eligible users: workers/supervisors in this building OR org-wide (no building)
    const users = await this.prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] },
        OR: [
          { buildingId: buildingId ?? undefined },
          { buildingId: null },
        ],
      },
      select: { id: true },
    });

    if (users.length === 0) return;

    const userIds = users.map((u) => u.id);
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });

    if (subs.length === 0) return;

    const payloadStr = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloadStr)
          .catch(async (err: any) => {
            // Remove stale / expired subscriptions automatically
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              await this.prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
            }
            throw err;
          }),
      ),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) this.logger.warn(`Push to building ${buildingId}: ${sent} sent, ${failed} failed`);
  }
}
