import { useState, useEffect, useCallback, useMemo } from 'react';
import { getNotifications, saveNotification, markAsRead, clearAllNotifications, deleteNotification, InAppNotification } from '../utils/db';
import { getBackendNotifications, markBackendNotificationAsRead, markAllBackendNotificationsRead, deleteBackendNotification, clearAllBackendNotifications } from '../api/client';

export interface NotificationAuth {
  token?: string;
  ownerPin?: string;
}

export function useInAppNotifications(auth?: NotificationAuth) {
  const token = auth?.token;
  const ownerPin = auth?.ownerPin;
  const memoizedAuth = useMemo(() => ({ token, ownerPin }), [token, ownerPin]);

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const hasAuth = !!(token || ownerPin);

  const loadLocal = useCallback(async () => {
    try {
      const list = await getNotifications();
      // Keep only last 50 locally to avoid IndexedDB bloat (SaaS standard limit)
      if (list.length > 50) {
        for (let i = 50; i < list.length; i++) {
          await deleteNotification(list[i].id);
        }
        const sliced = list.slice(0, 50);
        setNotifications(sliced);
        setUnreadCount(sliced.filter((n) => !n.read).length);
      } else {
        setNotifications(list);
        setUnreadCount(list.filter((n) => !n.read).length);
      }
    } catch (err) {
      console.warn('[useInAppNotifications] Failed to load local IndexedDB:', err);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!hasAuth || !navigator.onLine) return;
    setIsLoading(true);
    try {
      const backendNotifs = await getBackendNotifications(memoizedAuth);
      
      // Save/overwrite all backend notifications to local DB
      for (const item of backendNotifs) {
        await saveNotification({
          id: item._id, // Mongo ID aligns with client local ID
          title: item.title,
          body: item.body,
          url: item.url || '/',
          sound: item.sound || 'default',
          timestamp: new Date(item.createdAt).getTime(),
          read: item.read
        });
      }
      
      // Deduplicate/reconcile: If a local notification has a Mongo ID, but isn't in backendNotifs,
      // it means it was deleted on another device or pruned. We delete it locally.
      const local = await getNotifications();
      const backendIds = new Set(backendNotifs.map(n => n._id));
      const objectIdPattern = /^[0-9a-fA-F]{24}$/;
      
      for (const locItem of local) {
        if (objectIdPattern.test(locItem.id) && !backendIds.has(locItem.id)) {
          await deleteNotification(locItem.id);
        }
      }
    } catch (err) {
      console.error('[useInAppNotifications] Sync failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [hasAuth, memoizedAuth]);

  const loadAndSync = useCallback(async () => {
    await loadLocal();
    if (navigator.onLine && hasAuth) {
      await sync();
      await loadLocal();
    }
  }, [loadLocal, sync, hasAuth]);

  useEffect(() => {
    loadAndSync();

    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === 'PLAY_NOTIFICATION_SOUND' || 
        event.data?.type === 'PUSH_NOTIFICATION_RECEIVED'
      ) {
        loadAndSync();
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    
    // Add online listener to auto-sync when network returns
    window.addEventListener('online', loadAndSync);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
      window.removeEventListener('online', loadAndSync);
    };
  }, [loadAndSync]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id);
      await loadLocal(); // update local state instantly for responsiveness (optimistic UI)
      
      if (hasAuth && navigator.onLine) {
        // Run network updates in background
        void markBackendNotificationAsRead(id, memoizedAuth).catch(console.error);
      }
    } catch (err) {
      console.error('[useInAppNotifications] markAsRead error:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      for (const n of notifications) {
        if (!n.read) {
          await markAsRead(n.id);
        }
      }
      await loadLocal();
      
      if (hasAuth && navigator.onLine) {
        void markAllBackendNotificationsRead(memoizedAuth).catch(console.error);
      }
    } catch (err) {
      console.error('[useInAppNotifications] markAllAsRead error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      await loadLocal();
      
      if (hasAuth && navigator.onLine) {
        void deleteBackendNotification(id, memoizedAuth).catch(console.error);
      }
    } catch (err) {
      console.error('[useInAppNotifications] delete error:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllNotifications();
      await loadLocal();
      
      if (hasAuth && navigator.onLine) {
        void clearAllBackendNotifications(memoizedAuth).catch(console.error);
      }
    } catch (err) {
      console.error('[useInAppNotifications] clearAll error:', err);
    }
  };

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    deleteNotification: handleDelete,
    clearAll: handleClearAll,
    refresh: loadAndSync,
  };
}
