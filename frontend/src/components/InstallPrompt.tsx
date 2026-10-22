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
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-[rgba(44,34,30,0.92)] backdrop-blur-[16px] border-t border-white/12 shadow-2xl">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-full bg-[#C4466F]/20 text-[#E8829F] flex items-center justify-center">
            <Download size={16} />
          </div>
          <div className="truncate">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white">Install App</p>
            <p className="text-[11px] text-white/60 truncate">Fast access right from your home screen</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstallClick}
            className="min-h-[38px] px-4 bg-[#C4466F] text-white font-bold text-xs uppercase tracking-[0.15em] rounded-xl hover:bg-[#A83257] active:scale-[0.98] transition-all shadow-md cursor-pointer"
          >
            Install
          </button>
          <button
            onClick={() => setDeferredPrompt(null)}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            aria-label="Dismiss install banner"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
