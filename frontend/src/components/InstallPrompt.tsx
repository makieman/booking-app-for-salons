import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // If already running as installed standalone app, do nothing
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handleBeforeInstall = (e: Event) => {
      // Prevent Chrome from showing its own mini-infobar
      e.preventDefault();
      // Store the event so we can trigger it on button click
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      // Hide the button immediately after successful install
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('[InstallPrompt] User accepted install');
    }
    // Whether accepted or dismissed, clear the prompt — it cannot be reused
    setDeferredPrompt(null);
  };

  // Do not render if already installed or event never fired
  const isStandalone =
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full bg-brand-black text-white p-4 flex items-center justify-between z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <p className="text-sm font-black uppercase tracking-widest">Install this app</p>
      <div className="flex items-center gap-3">
        <button
          onClick={handleInstallClick}
          className="bg-white text-brand-black px-5 py-2 text-xs font-black uppercase tracking-[0.2em] hover:bg-brand-gray-100 transition-colors"
        >
          Install
        </button>
        <button
          onClick={() => setDeferredPrompt(null)}
          className="text-brand-gray-400 hover:text-white p-2 transition-colors"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
