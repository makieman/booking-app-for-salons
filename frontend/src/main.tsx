import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { TenantProvider } from './hooks/useTenant.tsx';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

// Register the service worker for PWA functionality.
// When a new SW activates and takes control of an already-controlled page,
// reload once automatically so users immediately run the latest bundle.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let isRefreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.info('[PWA] App is ready to work offline.');
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    // Check for updates whenever the user returns to the app/tab or reconnects
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(console.error);
      }
    });

    window.addEventListener('online', () => {
      registration.update().catch(console.error);
    });

    // Check for updates every 5 minutes while the app is open
    setInterval(() => {
      registration.update().catch(console.error);
    }, 5 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TenantProvider>
      <App />
      <Analytics />
      <SpeedInsights />
    </TenantProvider>
  </StrictMode>,
);
