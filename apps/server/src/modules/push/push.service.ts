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

  // `urgency: 'high'` tells FCM/APNs to wake a dozing phone and deliver the
  // banner immediately instead of batching it (batching delays or drops it).
  // TTL keeps a briefly-offline phone eligible for delivery for 24h.
  private readonly sendOptions: webpush.RequestOptions = { TTL: 24 * 60 * 60, urgency: 'high' };

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
   * Handle a browser-initiated subscription rotation (`pushsubscriptionchange`).
   * Push services periodically expire/rotate endpoints; when that happens the
   * service worker re-subscribes and calls this with the OLD endpoint so we can
   * carry the user/org over to the NEW endpoint without a fresh login. Without
   * it, a rotated subscription silently dies until the cleaner happens to reopen
   * the app — a prime cause of "sometimes I get a banner, sometimes not".
   */
  async rotate(oldEndpoint: string | undefined, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    const existing = oldEndpoint
      ? await this.prisma.pushSubscription.findUnique({ where: { endpoint: oldEndpoint } })
      : null;
    // If we can't map the old endpoint back to a user, there's nothing to preserve.
    if (!existing) return { ok: false };

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId: existing.userId, orgId: existing.orgId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { userId: existing.userId, orgId: existing.orgId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    if (oldEndpoint && oldEndpoint !== sub.endpoint) {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint: oldEndpoint } });
    }
    this.logger.log(`Rotated push subscription for user ${existing.userId}`);
    return { ok: true };
  }

  /**
   * Send a push notification to users in a building.
   * @param roles — which roles to target (default: CLEANER only)
   */
  async sendToBuilding(
    orgId: string,
    buildingId: string | null,
    payload: PushPayload,
    roles: string[] = ['CLEANER'],
  ) {
    if (!process.env.VAPID_PUBLIC_KEY) return;

    const users = await this.prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        role: { in: roles as any },
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
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloadStr, this.sendOptions)
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

  /** Human-readable push provider from a subscription endpoint (endpoint itself is never exposed). */
  private providerOf(endpoint: string): string {
    try {
      const host = new URL(endpoint).host;
      if (host.includes('push.apple.com')) return 'apple (iPhone/iPad)';
      if (host.includes('fcm.googleapis.com') || host.includes('android.googleapis.com')) return 'google (Android/Chrome)';
      if (host.includes('mozilla.com')) return 'mozilla (Firefox)';
      return host;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Copy-paste-a-link overview of push readiness: is VAPID configured, and which
   * users have live subscriptions (and from which platform). A cleaner whose
   * iPhone never completed the install-PWA + allow-notifications flow simply
   * won't have an `apple` subscription here.
   */
  async diagnose() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        name: true,
        role: true,
        building: { select: { name: true } },
        pushSubscriptions: { select: { endpoint: true, createdAt: true } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return {
      vapidConfigured: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
      serverVapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
      users: users.map((u) => ({
        name: u.name,
        role: u.role,
        building: u.building?.name ?? 'כל הבניינים',
        subscriptions: u.pushSubscriptions.map((s) => ({
          provider: this.providerOf(s.endpoint),
          since: s.createdAt,
        })),
      })),
    };
  }

  /**
   * Fire a real test notification at every stored subscription and report the
   * exact per-device outcome (including the push provider's error status), so
   * "notifications don't arrive" can be split into client-side vs server-side.
   */
  async sendTestToAll() {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { error: 'VAPID keys not configured on the server' };
    }
    const subs = await this.prisma.pushSubscription.findMany({
      include: { user: { select: { name: true, role: true } } },
    });
    const payload = JSON.stringify({
      title: '🔔 בדיקת התראות',
      body: 'אם אתה רואה את זה — ההתראות עובדות!',
      url: '/cleaner',
      tag: 'push-test',
    });
    const results = await Promise.all(
      subs.map(async (s) => {
        const base = { user: s.user.name, role: s.user.role, provider: this.providerOf(s.endpoint) };
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, this.sendOptions);
          return { ...base, sent: true };
        } catch (err: any) {
          // Self-heal: prune subscriptions the push service says are gone.
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await this.prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
          }
          return {
            ...base,
            sent: false,
            statusCode: err?.statusCode ?? null,
            error: typeof err?.body === 'string' ? err.body.slice(0, 200) : String(err?.message ?? err),
          };
        }
      }),
    );
    return {
      totalSubscriptions: subs.length,
      sent: results.filter((r: any) => r.sent).length,
      failed: results.filter((r: any) => !r.sent).length,
      results,
    };
  }
}
