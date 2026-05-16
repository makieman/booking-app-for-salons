/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Precache all assets injected by VitePWA's injectManifest strategy
precacheAndRoute(self.__WB_MANIFEST);

// ── Push Notification Handler ─────────────────────────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  const { title, body, url = '/' } = event.data.json() as {
    title: string;
    body: string;
    url?: string;
  };

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     '/android-chrome-192x192.png',
      badge:    '/favicon-32x32.png',
      vibrate:  [100, 50, 100],
      tag:      'flo-booking',
      renotify: true,
      data:     { url },
    }),
  );
});

// ── Notification Click Handler ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl: string = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window if available
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
