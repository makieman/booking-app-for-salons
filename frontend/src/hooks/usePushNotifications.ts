import { useEffect, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── VAPID helper — convert base64 string to Uint8Array ───────────────────────
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0))) as unknown as BufferSource;
}

// Convert an ArrayBuffer to URL-safe base64 (no padding, - instead of +, _ instead of /)
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export interface UsePushNotifications {
  permission:   PermissionState;
  isSubscribed: boolean;
  isLoading:    boolean;
  subscribe:    (customerPhone: string) => Promise<boolean>;
  unsubscribe:  () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePushNotifications(customerPhone?: string): UsePushNotifications {
  const isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator;

  const [permission, setPermission]     = useState<PermissionState>(
    isSupported ? (Notification.permission as PermissionState) : 'unsupported',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);

  // Check subscription state on mount or phone change.
  // Note: An admin subscription on this browser does NOT mean the customer is subscribed!
  // We track customer subscription separately via localStorage 'customerPushPhone'.
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        const savedPhone = localStorage.getItem('customerPushPhone');
        if (!sub || !savedPhone || Notification.permission !== 'granted') {
          setIsSubscribed(false);
          return;
        }

        if (customerPhone && customerPhone.trim()) {
          const cleanSaved = savedPhone.replace(/[\s\-().]/g, '');
          const cleanInput = customerPhone.trim().replace(/[\s\-().]/g, '');
          const matches = cleanSaved === cleanInput || cleanSaved.endsWith(cleanInput) || cleanInput.endsWith(cleanSaved);

          setIsSubscribed(matches);
        } else {
          setIsSubscribed(true);
        }
      })
      .catch((err) => console.error('[usePushNotifications] getSubscription error:', err));
  }, [isSupported, customerPhone]);

  // ── subscribe ───────────────────────────────────────────────────────────────
  const subscribe = useCallback(async (phone: string): Promise<boolean> => {
    if (!isSupported || !phone || !phone.trim()) return false;

    setIsLoading(true);
    try {
      // 1. Request permission if not already granted
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== 'granted') return false;

      // 2. Fetch VAPID public key from backend
      const vapidRes = await fetch(`${API_BASE}/push/vapid-key`);
      if (!vapidRes.ok) throw new Error('Failed to fetch VAPID key');
      const { publicKey } = await vapidRes.json() as { publicKey: string };

      // 3. Get existing subscription or create new via PushManager
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // 4. Extract keys as URL-safe base64
      const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh')!);
      const auth   = arrayBufferToBase64Url(sub.getKey('auth')!);

      // 5. Send subscription to backend scoped to role='customer'
      const saveRes = await fetch(`${API_BASE}/push/subscribe`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint:      sub.endpoint,
          keys:          { p256dh, auth },
          customerPhone: phone.trim(),
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save subscription on server');

      const data = await saveRes.json().catch(() => ({}));
      const savedPhone = data.phone || phone.trim();
      localStorage.setItem('customerPushPhone', savedPhone);

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[usePushNotifications] subscribe error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  // Automatically re-save customer subscription if permission is already granted and customer phone changed
  useEffect(() => {
    if (!isSupported || !customerPhone || !customerPhone.trim()) return;
    if (Notification.permission !== 'granted') return;

    const savedPhone = localStorage.getItem('customerPushPhone');
    if (!savedPhone) return;

    const cleanSaved = savedPhone.replace(/[\s\-().]/g, '');
    const cleanInput = customerPhone.trim().replace(/[\s\-().]/g, '');
    const isSamePhone = cleanSaved === cleanInput || cleanSaved.endsWith(cleanInput) || cleanInput.endsWith(cleanSaved);

    if (!isSamePhone) {
      subscribe(customerPhone.trim()).catch((err) =>
        console.warn('[usePushNotifications] Failed to auto-resave push on phone change:', err)
      );
    }
  }, [customerPhone, isSupported, subscribe]);

  // ── unsubscribe ─────────────────────────────────────────────────────────────
  const unsubscribe = async (): Promise<void> => {
    if (!isSupported) return;

    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      // Remove customer subscription from backend
      if (sub) {
        await fetch(`${API_BASE}/push/unsubscribe`, {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        });
      }

      localStorage.removeItem('customerPushPhone');
      setIsSubscribed(false);
    } catch (err) {
      console.error('[usePushNotifications] unsubscribe error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
