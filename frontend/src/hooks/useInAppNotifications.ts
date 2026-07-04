import { useState, useEffect } from 'react';
import { getNotifications, saveNotification, markAsRead, clearAllNotifications, deleteNotification, InAppNotification } from '../utils/db';

export function useInAppNotifications() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    try {
      const list = await getNotifications();
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch (err) {
      console.warn('[useInAppNotifications] Failed to load from IndexedDB:', err);
    }
  };

  useEffect(() => {
    load();

    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      // Reload on both play sound or specific push received events
      if (
        event.data?.type === 'PLAY_NOTIFICATION_SOUND' || 
        event.data?.type === 'PUSH_NOTIFICATION_RECEIVED'
      ) {
        load();
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id);
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      for (const n of notifications) {
        if (!n.read) {
          await markAsRead(n.id);
        }
      }
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllNotifications();
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  return {
    notifications,
    unreadCount,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    deleteNotification: handleDelete,
    clearAll: handleClearAll,
    refresh: load,
  };
}
