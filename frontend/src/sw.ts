/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

import { saveNotification, getNotifications } from './utils/db';


// ── Lifecycle: Take control immediately on activation
// This ensures users always get the latest version without a manual refresh.
self.skipWaiting();
clientsClaim();

// ── Precache all assets injected by VitePWA's injectManifest strategy 
precacheAndRoute(self.__WB_MANIFEST);

// ── Remove stale precache entries from previous SW versions 
cleanupOutdatedCaches();

// ── SPA Navigation Route
// Serve index.html for all navigation requests except /api routes.
// This allows the app to work offline for already-visited routes in production.
// In development, Vite serves index.html dynamically and it is not precached.
if (import.meta.env.PROD) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
      denylist: [/^\/api/],
    }),
  );
}

// ── Runtime Caching: Services API ────────────────────────────────────────────
// StaleWhileRevalidate: serves cached services instantly (<20ms) while silently
// revalidating in the background. On first visit, fetches from network.
registerRoute(
  /^\/api\/services/i,
  new StaleWhileRevalidate({
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
  event.waitUntil(
    (async () => {
      let rawJson: any = null;
      if (event.data) {
        try {
          rawJson = event.data.json();
        } catch {
          try {
            const text = event.data.text();
            rawJson = { title: 'Flo Sisterlocks', body: text };
          } catch {}
        }
      }

      // Fall back to default title/body if payload is missing or incomplete
      const title = rawJson?.title || 'Flo Sisterlocks';
      const body = rawJson?.body || 'You have an update regarding your appointment.';
      const url = rawJson?.url || '/';
      const sound = rawJson?.sound || 'default';
      const notificationId = rawJson?.id || rawJson?.tag || `flo-booking-${Date.now()}`;

      // Duplicate check for IndexedDB: may skip saving to local DB, but MUST NEVER suppress showNotification
      let isDuplicate = false;
      try {
        const existing = await getNotifications();
        isDuplicate = existing.some(
          (n) => n.id === notificationId || 
          (n.title === title && n.body === body && Date.now() - n.timestamp < 5000)
        );
      } catch (err) {
        console.warn('[SW] Duplicate check failed, continuing:', err);
      }

      if (!isDuplicate) {
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
      }

      // Do NOT set silent:true unless the user's explicit preference is 'silent'
      const isSilentPref = sound === 'silent';
      const notificationVibrate = isSilentPref ? [] : [100, 50, 100];

      // Every push event must end in showNotification. The notification `tag` prevents duplicate banners at the OS level
      await self.registration.showNotification(title, {
        body,
        icon:     '/android-chrome-192x192.png',
        badge:    '/favicon-32x32.png',
        silent:   isSilentPref,
        vibrate:  notificationVibrate,
        tag:      notificationId,
        renotify: true,
        data:     { url, sound },
      } as any);

      // Notify any open windows to update in-app notification indicators
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        client.postMessage({ type: 'PUSH_NOTIFICATION_RECEIVED', id: notificationId });
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
