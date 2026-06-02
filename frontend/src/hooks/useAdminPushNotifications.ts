import { useEffect, useState } from 'react';

// ── VAPID helper ──────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Convert an ArrayBuffer to URL-safe base64 (no padding, - instead of +, _ instead of /)
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Types ─────────────────────────────────────────────────────────────────────
type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface UseAdminPushNotifications {
  permission:      PermissionState;
  isSubscribed:    boolean;
  isLoading:       boolean;
  soundPreference: string;
  subscribe:       () => Promise<boolean>;
  unsubscribe:     () => Promise<void>;
  updateSound:     (sound: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
/**
 * Manages push notification subscription for the admin panel.
 * Uses /api/push/subscribe-admin and /api/push/unsubscribe-admin endpoints.
 * No customerPhone required — subscriptions are tagged role:'admin' on the server.
 */
export function useAdminPushNotifications(): UseAdminPushNotifications {
  const isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator;

  const [permission, setPermission]     = useState<PermissionState>(
    isSupported ? (Notification.permission as PermissionState) : 'unsupported',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [soundPreference, setSoundPreference] = useState<string>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('soundPreference') || 'default' : 'default')
  );

  // Check existing admin subscription on mount
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        const wantsPush = localStorage.getItem('adminPushEnabled') === 'true';

        if (!sub) {
          setIsSubscribed(false);
          // Auto-recover subscription if they previously enabled it and browser still allows it
          if (wantsPush && Notification.permission === 'granted') {
            console.log('[useAdminPush] Auto-recovering missing subscription...');
            subscribe();
          }
          return;
        }

        // We have a subscription
        setIsSubscribed(true);
        if (!wantsPush) {
          localStorage.setItem('adminPushEnabled', 'true');
        }
      })
      .catch((err) => console.error('[useAdminPush] getSubscription error:', err));
  }, [isSupported]);

  // ── subscribe ───────────────────────────────────────────────────────────────
  const subscribe = async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== 'granted') return false;

      // 2. Fetch VAPID public key
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) throw new Error('Failed to fetch VAPID key');
      const { publicKey } = await vapidRes.json() as { publicKey: string };

      // 3. Subscribe via PushManager
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Extract keys as URL-safe base64
      const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh')!);
      const auth   = arrayBufferToBase64Url(sub.getKey('auth')!);

      // 5. Save to server as admin subscription
      const employeeId = localStorage.getItem('employeeId') ?? 'admin';
      const currentSound = localStorage.getItem('soundPreference') ?? 'default';

      const saveRes = await fetch('/api/push/subscribe-admin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh, auth },
          employeeId,
          soundPreference: currentSound,
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save admin subscription on server');

      setIsSubscribed(true);
      setSoundPreference(currentSound);
      localStorage.setItem('adminPushEnabled', 'true');
      return true;
    } catch (err) {
      console.error('[useAdminPush] subscribe error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // ── unsubscribe ─────────────────────────────────────────────────────────────
  const unsubscribe = async (): Promise<void> => {
    if (!isSupported) return;

    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      await fetch('/api/push/unsubscribe-admin', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: sub.endpoint }),
      });

      await sub.unsubscribe();
      setIsSubscribed(false);
      localStorage.setItem('adminPushEnabled', 'false');
    } catch (err) {
      console.error('[useAdminPush] unsubscribe error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ── updateSound ─────────────────────────────────────────────────────────────
  const updateSound = async (sound: string): Promise<void> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      const res = await fetch('/api/push/preferences', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: sub.endpoint, soundPreference: sound }),
      });
      if (!res.ok) throw new Error('Failed to update sound preference on server');

      localStorage.setItem('soundPreference', sound);
      setSoundPreference(sound);
    } catch (err) {
      console.error('[useAdminPush] updateSound error:', err);
    }
  };

  return { permission, isSubscribed, isLoading, soundPreference, subscribe, unsubscribe, updateSound };
}
