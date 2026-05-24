/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// ── Lifecycle: Take control immediately on activation ────────────────────────
// This ensures users always get the latest version without a manual refresh.
self.skipWaiting();
clientsClaim();

// ── Precache all assets injected by VitePWA's injectManifest strategy ────────
precacheAndRoute(self.__WB_MANIFEST);

// ── Remove stale precache entries from previous SW versions ─────────────────
cleanupOutdatedCaches();

// ── SPA Navigation Route ─────────────────────────────────────────────────────
// Serve index.html for all navigation requests except /api routes.
// This allows the app to work offline for already-visited routes.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api/],
  }),
);

// ── Runtime Caching: Services API ────────────────────────────────────────────
// NetworkFirst: try network, fall back to cache. Keeps data fresh when online.
registerRoute(
  /^\/api\/services/i,
  new NetworkFirst({
    cacheName: 'services-api-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 86_400 }), // 24 h
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  'GET',
);

// ── Runtime Caching: Static Assets (fonts, images from CDNs) ─────────────────
registerRoute(
  ({ request }) =>
    request.destination === 'image' ||
    request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: 'static-assets-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 86_400 }), // 30 days
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ── Push Notification Handler ─────────────────────────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  const { title, body, url = '/', sound = 'default' } = event.data.json() as {
    title: string;
    body: string;
    url?: string;
    sound?: 'default' | 'chime' | 'bell' | 'ding' | 'silent';
  };

  event.waitUntil(
    (async () => {
      // Show the notification
      await self.registration.showNotification(title, {
        body,
        icon:     '/android-chrome-192x192.png',
        badge:    '/favicon-32x32.png',
        vibrate:  sound === 'silent' ? [] : [100, 50, 100],
        tag:      `flo-booking-${Date.now()}`,   // unique tag — prevents silent replacement
        renotify: true,
        data:     { url, sound },
      } as any);

      // Tell any open app window to play the sound
      if (sound !== 'silent') {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'PLAY_NOTIFICATION_SOUND', sound });
        }
      }
    })()
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
