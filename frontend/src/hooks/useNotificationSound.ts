import { useEffect } from 'react';

const SOUND_FILES: Record<string, string> = {
  default: '/sounds/default.mp3',
  chime:   '/sounds/chime.mp3',
  bell:    '/sounds/bell.mp3',
  ding:    '/sounds/ding.mp3',
};

export function useNotificationSound() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'PLAY_NOTIFICATION_SOUND') return;
      const src = SOUND_FILES[event.data.sound] ?? SOUND_FILES.default;
      const audio = new Audio(src);
      audio.volume = 0.7;
      audio.play().catch(() => {
        // Browsers block autoplay without prior user interaction.
        // This is expected if the tab was idle. Ignore silently.
      });
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
}
