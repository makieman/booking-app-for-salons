/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

import { saveNotification, getNotifications } from './utils/db';


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

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  event.waitUntil(
    (async () => {
      let rawJson: any;
      try {
        rawJson = event.data.json();
      } catch (e) {
        console.error('[SW] Failed to parse push payload as JSON:', e);
        return;
      }

      if (!rawJson || !rawJson.title || !rawJson.body) {
        console.warn('[SW] Push payload missing title or body:', rawJson);
        return;
      }

      const { title, body, url = '/', sound = 'default' } = rawJson;
      // Use backend ID or tag if provided, otherwise generate one
      const notificationId = rawJson.id || rawJson.tag || `flo-booking-${Date.now()}`;

      try {
        const existing = await getNotifications();
        const isDuplicate = existing.some(
          (n) => n.id === notificationId || 
          (n.title === title && n.body === body && Date.now() - n.timestamp < 5000)
        );
        if (isDuplicate) {
          console.log('[SW] Duplicate push notification blocked:', notificationId);
          return;
        }
      } catch (err) {
        console.warn('[SW] Duplicate check failed, continuing:', err);
      }

      // Save notification to IndexedDB
      try {
        await saveNotification({
          id: notificationId,
          title,
          body,
          url,
          sound,
          timestamp: Date.now(),
          read: false,
        });
      } catch (err) {
        console.error('[SW] Failed to save notification to IndexedDB:', err);
      }

      // Show the notification
      await self.registration.showNotification(title, {
        body,
        icon:     '/android-chrome-192x192.png',
        badge:    '/favicon-32x32.png',
        vibrate:  sound === 'silent' ? [] : [100, 50, 100],
        tag:      notificationId,   // unique tag — prevents silent replacement
        renotify: true,
        data:     { url, sound },
      } as any);

      // Tell any open app window to reload and play sound
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'PUSH_NOTIFICATION_RECEIVED', id: notificationId });
        if (sound !== 'silent') {
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
        const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;
        for (const client of clientList) {
          if (client.url === absoluteTargetUrl && 'focus' in client) {
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
