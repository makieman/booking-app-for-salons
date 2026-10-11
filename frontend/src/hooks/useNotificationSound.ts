import { useEffect } from 'react';
import { initNotificationSoundListener } from '../utils/notificationSound';

export function useNotificationSound() {
  useEffect(() => {
    initNotificationSoundListener();
  }, []);
}

