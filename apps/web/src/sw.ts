import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

clientsClaim();
self.skipWaiting();

// Inject Workbox precache manifest (filled by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);

// ── Push notification handler ──────────────────────────────────────────────

interface PushData {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// The VAPID public key (safe to embed) — needed to re-subscribe on rotation.
const VAPID_PUBLIC_KEY = 'BJ5sC-Xbm4p2tZ3uxkeQqgTDL4kCGvlu8MocKQ9TtbzB-FJBF8rPxkkNPhvSqniHlCTEVWNfwA1fMtO9pAr-C5Q';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

self.addEventListener('push', (event) => {
  // A `userVisibleOnly` subscription MUST show a notification for every push —
  // bailing out (e.g. on an empty payload) makes the browser revoke the
  // subscription, silently killing all future banners. So always show one.
  let data: PushData = { title: '🚾 ToiletMon — תקלה חדשה', body: 'התקבלה תקלה חדשה' };
  if (event.data) {
    try {
      data = event.data.json() as PushData;
    } catch {
      data = { title: '🚾 ToiletMon', body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'toiletmon',
      renotify: true,
      requireInteraction: true,
      dir: 'rtl',
      data: { url: data.url ?? '/cleaner' },
    }),
  );
});

// ── Subscription rotation ──────────────────────────────────────────────────
// The push service periodically expires/rotates the endpoint. When it does,
// re-subscribe and hand the server the old→new mapping so delivery keeps
// working without the cleaner having to reopen the app.
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as any;
  e.waitUntil(
    (async () => {
      const oldEndpoint: string | undefined = e.oldSubscription?.endpoint;
      let sub: PushSubscription | null = e.newSubscription ?? null;
      if (!sub) {
        try {
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        } catch {
          return;
        }
      }
      try {
        await fetch('/api/push/rotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldEndpoint, subscription: sub.toJSON() }),
        });
      } catch {
        /* best-effort — will re-sync next time the app opens */
      }
    })(),
  );
});

// ── Notification click → open / focus the app ─────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) ?? '/cleaner';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing open window if found
        for (const client of windowClients) {
          if ('focus' in client) return (client as WindowClient).focus();
        }
        // Otherwise open a new window
        return self.clients.openWindow(targetUrl);
      }),
  );
});
