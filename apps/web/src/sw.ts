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

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data: PushData;
  try {
    data = event.data.json() as PushData;
  } catch {
    data = { title: '🚾 ToiletMon', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'toiletmon',
      renotify: true,
      dir: 'rtl',
      data: { url: data.url ?? '/cleaner' },
    }),
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
