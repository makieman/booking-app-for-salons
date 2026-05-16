import { useEffect, useState } from 'react';

// ── VAPID helper — convert base64 string to Uint8Array ───────────────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Types ─────────────────────────────────────────────────────────────────────
type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface UsePushNotifications {
  permission:   PermissionState;
  isSubscribed: boolean;
  isLoading:    boolean;
  subscribe:    (customerPhone: string) => Promise<boolean>;
  unsubscribe:  () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePushNotifications(): UsePushNotifications {
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
      .then((sub) => setIsSubscribed(sub !== null))
      .catch((err) => console.error('[usePushNotifications] getSubscription error:', err));
  }, [isSupported]);

  // ── subscribe ───────────────────────────────────────────────────────────────
  const subscribe = async (customerPhone: string): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== 'granted') return false;

      // 2. Fetch VAPID public key from backend
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) throw new Error('Failed to fetch VAPID key');
      const { publicKey } = await vapidRes.json() as { publicKey: string };

      // 3. Subscribe via PushManager
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Extract keys
      const p256dh = btoa(
        String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!)),
      );
      const auth = btoa(
        String.fromCharCode(...new Uint8Array(sub.getKey('auth')!)),
      );

      // 5. Send subscription to backend
      const saveRes = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint:      sub.endpoint,
          keys:          { p256dh, auth },
          customerPhone,
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save subscription on server');

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[usePushNotifications] subscribe error:', err);
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

      // Remove from backend first
      await fetch('/api/push/unsubscribe', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: sub.endpoint }),
      });

      // Then unsubscribe locally
      await sub.unsubscribe();
      setIsSubscribed(false);
    } catch (err) {
      console.error('[usePushNotifications] unsubscribe error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
