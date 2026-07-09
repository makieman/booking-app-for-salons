import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { TenantProvider } from './hooks/useTenant.tsx';

// Register the service worker for PWA functionality.
// onNeedRefresh fires when a new SW is installed and waiting.
// We call updateSW() to skip waiting and reload — users always
// get the latest version without a stale-cache loop.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-reload to activate the new service worker immediately.
    // TODO: replace with a toast prompt for a better UX if desired.
    updateSW(true);
  },
  onOfflineReady() {
    console.info('[PWA] App is ready to work offline.');
  },
  onRegisteredSW(_swUrl, registration) {
    // Check for updates every hour while the app is open
    if (registration) {
      setInterval(() => {
        registration.update().catch(console.error);
      }, 60 * 60 * 1000);
    }
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TenantProvider>
      <App />
    </TenantProvider>
  </StrictMode>,
);
