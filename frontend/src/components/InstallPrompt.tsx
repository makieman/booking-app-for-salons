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
    <button
      onClick={handleInstallClick}
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-brand-black text-brand-white px-4 py-3 rounded-full text-[11px] font-black tracking-[0.2em] uppercase shadow-xl hover:scale-105 active:scale-95 transition-all"
    >
      <Download size={14} />
      Install App
    </button>
  );
}
