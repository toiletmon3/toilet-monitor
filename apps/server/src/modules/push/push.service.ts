import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as webpush from 'web-push';
import { readAlertSettings } from '../../common/alert-mode';

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
    return this.sendToBuildings(orgId, buildingId ? [buildingId] : [], payload, roles);
  }

  /**
   * Send a push notification to users across a set of buildings — used for the
   * property-wide batched pulse, where one grouped push must reach the cleaners
   * of every building in the property (plus building-less/global cleaners),
   * each device notified exactly once. An empty `buildingIds` targets only the
   * global (buildingId = null) users, matching the single-building helper.
   */
  async sendToBuildings(
    orgId: string,
    buildingIds: string[],
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
          { buildingId: buildingIds.length ? { in: buildingIds } : undefined },
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
    if (failed > 0) this.logger.warn(`Push to buildings [${buildingIds.join(', ')}]: ${sent} sent, ${failed} failed`);
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
  async diagnose(orgId: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, orgId },
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
   * One-call diagnosis of the batched-alert (Option 2) pipeline for an org:
   * per property — its mode/interval, whether the pulse ever fired
   * (lastBatchPulseAt), how many OPEN issues sit in it, how long the oldest has
   * waited, and how many minutes until the next pulse is due (negative = the
   * pulse is overdue and should already have fired). Plus a per-cleaner push
   * subscription count, so "no batched notification" can be split into
   * not-firing (timing/no-open-issue) vs not-delivered (no subscription / VAPID).
   */
  async batchDiagnose(orgId: string) {
    const now = Date.now();

    const properties = await this.prisma.property.findMany({
      where: { orgId },
      select: { id: true, name: true, settings: true, buildings: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const openIncidents = await this.prisma.incident.findMany({
      where: { restroom: { floor: { building: { orgId } } }, status: 'OPEN' },
      select: {
        reportedAt: true,
        notifiedAt: true,
        restroom: { select: { floor: { select: { building: { select: { propertyId: true } } } } } },
      },
    });
    const openByProp = new Map<string, Array<{ reportedAt: Date; notifiedAt: Date | null }>>();
    let openWithoutProperty = 0;
    for (const inc of openIncidents) {
      const pid = inc.restroom.floor.building.propertyId;
      if (!pid) { openWithoutProperty++; continue; }
      const arr = openByProp.get(pid) ?? [];
      arr.push({ reportedAt: inc.reportedAt, notifiedAt: inc.notifiedAt });
      openByProp.set(pid, arr);
    }

    const cleaners = await this.prisma.user.findMany({
      where: { orgId, role: 'CLEANER', isActive: true },
      select: { name: true, buildingId: true, pushSubscriptions: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });

    return {
      vapidConfigured: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
      openIssuesWithoutProperty: openWithoutProperty, // these NEVER get a batched pulse
      properties: properties.map((p) => {
        const cfg = readAlertSettings(p.settings);
        const open = openByProp.get(p.id) ?? [];
        const oldestMs = open.length ? Math.min(...open.map((i) => i.reportedAt.getTime())) : null;
        const lastPulseRaw = (p.settings as any)?.lastBatchPulseAt ?? null;
        const lastPulseMs = lastPulseRaw ? new Date(lastPulseRaw).getTime() : null;
        let nextPulseInMinutes: number | null = null;
        if (cfg.alertMode === 'batched' && oldestMs !== null) {
          const anchorMs = lastPulseMs !== null && lastPulseMs >= oldestMs ? lastPulseMs : oldestMs;
          nextPulseInMinutes = Math.round((anchorMs + cfg.batchIntervalMinutes * 60_000 - now) / 60_000);
        }
        return {
          name: p.name,
          alertMode: cfg.alertMode,
          batchIntervalMinutes: cfg.batchIntervalMinutes,
          buildings: p.buildings.map((b) => b.name),
          lastBatchPulseAt: lastPulseRaw,
          openIssues: open.length,
          oldestOpenWaitedMinutes: oldestMs !== null ? Math.round((now - oldestMs) / 60_000) : null,
          // negative = pulse is overdue (should already have fired on the next tick)
          nextPulseInMinutes,
        };
      }),
      cleaners: cleaners.map((c) => ({
        name: c.name,
        assignedTo: c.buildingId ? 'one building' : 'all buildings',
        pushSubscriptions: c.pushSubscriptions.length,
      })),
    };
  }

  /**
   * Fire a real test notification at every stored subscription and report the
   * exact per-device outcome (including the push provider's error status), so
   * "notifications don't arrive" can be split into client-side vs server-side.
   */
  async sendTestToAll(orgId: string) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { error: 'VAPID keys not configured on the server' };
    }
    const subs = await this.prisma.pushSubscription.findMany({
      where: { orgId },
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
