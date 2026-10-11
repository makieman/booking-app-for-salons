// frontend/src/utils/notificationSound.ts

export type SoundPreference = 'default' | 'chime' | 'bell' | 'ding' | 'silent';

export const SOUND_SOURCES: Record<Exclude<SoundPreference, 'silent'>, string> = {
  default: '/sounds/default.mp3',
  chime:   '/sounds/chime.mp3',
  bell:    '/sounds/bell.mp3',
  ding:    '/sounds/ding.mp3',
};

// Preload an Audio element per preference
const audioPool: Partial<Record<Exclude<SoundPreference, 'silent'>, HTMLAudioElement>> = {};

if (typeof window !== 'undefined') {
  (Object.keys(SOUND_SOURCES) as Array<keyof typeof SOUND_SOURCES>).forEach((key) => {
    try {
      const audio = new Audio(SOUND_SOURCES[key]);
      audio.preload = 'auto';
      audioPool[key] = audio;
    } catch (err) {
      console.warn('[notificationSound] Failed to create Audio element for', key, err);
    }
  });
}

let isAudioUnlocked = false;

/**
 * Unlocks audio playback across all preloaded elements to satisfy browser Autoplay policies.
 * Plays and immediately pauses each audio element at volume 0 on the first user gesture.
 */
export function unlockAudio() {
  if (isAudioUnlocked || typeof window === 'undefined') return;
  isAudioUnlocked = true;

  cleanupGestureListeners();

  const sounds = Object.values(audioPool);
  sounds.forEach((audio) => {
    if (!audio) return;
    const prevVolume = audio.volume;
    audio.volume = 0;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prevVolume || 1;
      })
      .catch((err) => {
        audio.volume = prevVolume || 1;
        console.debug('[notificationSound] Audio unlock attempt note:', err?.message || err);
      });
  });
}

function handleUserGesture() {
  unlockAudio();
}

function attachGestureListeners() {
  if (typeof window === 'undefined') return;
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  events.forEach((evt) => {
    window.addEventListener(evt, handleUserGesture, { capture: true, once: true, passive: true });
  });
}

function cleanupGestureListeners() {
  if (typeof window === 'undefined') return;
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  events.forEach((evt) => {
    window.removeEventListener(evt, handleUserGesture, { capture: true });
  });
}

// Automatically listen for first user gesture anywhere in the app
if (typeof window !== 'undefined') {
  attachGestureListeners();
}

/**
 * Plays the chosen notification sound preference.
 * Ignores 'silent', falls back to 'default', catches and logs play() rejections without throwing.
 */
export function playNotificationSound(pref?: string): Promise<void> {
  if (!pref || pref === 'silent' || typeof window === 'undefined') {
    return Promise.resolve();
  }

  // Ensure audio is marked as unlocked if called directly from a user gesture (e.g. Test button)
  if (!isAudioUnlocked) {
    unlockAudio();
  }

  const key = (pref in SOUND_SOURCES ? pref : 'default') as Exclude<SoundPreference, 'silent'>;
  const audio = audioPool[key] || audioPool.default;

  if (!audio) {
    console.warn('[notificationSound] No audio element found for preference:', pref);
    return Promise.resolve();
  }

  try {
    audio.currentTime = 0;
    audio.volume = 1;
    return audio.play().catch((err) => {
      console.warn('[notificationSound] play() was rejected:', key, err);
    });
  } catch (err) {
    console.warn('[notificationSound] Synchronous error playing sound:', key, err);
    return Promise.resolve();
  }
}

// ── Singleton Service Worker message listener (prevents double registration under React StrictMode) ──
let isSwListenerRegistered = false;

export function initNotificationSoundListener() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (isSwListenerRegistered) return;
  isSwListenerRegistered = true;

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') {
      const sound = event.data?.sound;
      console.log('[notificationSound] Received PLAY_NOTIFICATION_SOUND from SW:', sound);
      playNotificationSound(sound);
    }
  });
}

// Auto-register listener once
if (typeof window !== 'undefined') {
  initNotificationSoundListener();
}
