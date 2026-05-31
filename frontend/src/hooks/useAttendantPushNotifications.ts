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

interface UseAttendantPushNotifications {
  permission:      PermissionState;
  isSubscribed:    boolean;
  isLoading:       boolean;
  subscribe:       (token: string) => Promise<boolean>;
  unsubscribe:     (token: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
/**
 * Manages push notification subscription for the attendant panel.
 * Uses /api/push/subscribe-attendant and /api/push/unsubscribe-attendant endpoints.
 */
export function useAttendantPushNotifications(token: string): UseAttendantPushNotifications {
  const isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator;

  const [permission, setPermission]     = useState<PermissionState>(
    isSupported ? (Notification.permission as PermissionState) : 'unsupported',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);

  // Check existing subscription on mount
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (!sub) { setIsSubscribed(false); return; }
        // We assume if it's subscribed locally it's valid for this browser, 
        // ideally we would verify it on the backend, but for now we set to true.
        setIsSubscribed(true);
      })
      .catch((err) => console.error('[useAttendantPush] getSubscription error:', err));
  }, [isSupported]);

  // ── subscribe ───────────────────────────────────────────────────────────────
  const subscribe = async (authToken: string): Promise<boolean> => {
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
        applicationServerKey: urlBase64ToUint8Array(publicKey) as Uint8Array,
      });

      // 4. Extract keys as URL-safe base64
      const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh')!);
      const auth   = arrayBufferToBase64Url(sub.getKey('auth')!);

      // 5. Save to server as attendant subscription
      const saveRes = await fetch('/api/push/subscribe-attendant', {
        method:  'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body:    JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh, auth },
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save attendant subscription on server');

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[useAttendantPush] subscribe error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // ── unsubscribe ─────────────────────────────────────────────────────────────
  const unsubscribe = async (authToken: string): Promise<void> => {
    if (!isSupported) return;

    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      await fetch('/api/push/unsubscribe-attendant', {
        method:  'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body:    JSON.stringify({ endpoint: sub.endpoint }),
      });

      await sub.unsubscribe();
      setIsSubscribed(false);
    } catch (err) {
      console.error('[useAttendantPush] unsubscribe error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
