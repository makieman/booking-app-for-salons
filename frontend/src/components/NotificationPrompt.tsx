import { useEffect, useState, useMemo } from 'react';
import { Bell, Share, Compass } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface NotificationPromptProps {
  customerPhone: string;
  onDismiss:     () => void;
  title?:        string;
  description?:  string;
}

type Step = 'prompt' | 'success' | 'denied';

export function NotificationPrompt({
  customerPhone,
  onDismiss,
  title = 'Stay in the Loop',
  description = 'Get notified the moment your booking is approved or updated.',
}: NotificationPromptProps) {
  const { permission, isSubscribed, isLoading, subscribe } = usePushNotifications(customerPhone);
  const [step, setStep] = useState<Step>('prompt');

  // Detect iOS and In-App browsers
  const browserEnv = useMemo(() => {
    if (typeof window === 'undefined') {
      return { isIOS: false, isStandalone: false, isInApp: false };
    }
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    const isInApp = /FBAN|FBAV|Instagram|TikTok|Line|Twitter|Snapchat|MicroMessenger/i.test(ua);

    return { isIOS, isStandalone, isInApp };
  }, []);

  // Auto-dismiss after showing the success message
  useEffect(() => {
    if (step === 'success') {
      const t = setTimeout(onDismiss, 2500);
      return () => clearTimeout(t);
    }
  }, [step, onDismiss]);

  // If already subscribed on this browser for this customer phone, don't show
  if (isSubscribed) {
    return null;
  }

  // ── Guidance for Unsupported Browsers / iOS Safari / In-App Browsers ────────
  if (permission === 'unsupported') {
    // 1. In-App browser guidance (Instagram, Facebook, etc.)
    if (browserEnv.isInApp) {
      return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4">
          <div className="w-full max-w-lg bg-white/95 backdrop-blur-xl border border-[rgba(240,213,222,0.85)] rounded-2xl shadow-luxury p-6 flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 bg-[#C4466F]/10 text-[#C4466F] rounded-full flex items-center justify-center">
                <Compass size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4466F] mb-0.5">
                  Browser Notice
                </p>
                <h3 className="font-serif italic text-lg font-bold text-[#231F1D] tracking-tight leading-snug">
                  Open in Chrome or Safari
                </h3>
                <p className="text-xs text-[#6E655F] mt-1 leading-relaxed">
                  You are viewing this inside an in-app browser. Open this page directly in Safari or Chrome to enable instant appointment notifications.
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="w-full py-2.5 rounded-xl font-bold uppercase tracking-[0.18em] text-xs text-[#6E655F] hover:text-[#231F1D] hover:bg-[#C4466F]/5 transition-colors border border-[rgba(240,213,222,0.8)] cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      );
    }

    // 2. iOS Safari outside standalone mode guidance (iOS 16.4+)
    if (browserEnv.isIOS && !browserEnv.isStandalone) {
      return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4">
          <div className="w-full max-w-lg bg-white/95 backdrop-blur-xl border border-[rgba(240,213,222,0.85)] rounded-2xl shadow-luxury p-6 flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 bg-[#C4466F]/10 text-[#C4466F] rounded-full flex items-center justify-center">
                <Share size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4466F] mb-0.5">
                  iPhone & iPad Setup
                </p>
                <h3 className="font-serif italic text-lg font-bold text-[#231F1D] tracking-tight leading-snug">
                  Add to Home Screen
                </h3>
                <p className="text-xs text-[#6E655F] mt-1 leading-relaxed">
                  On iOS, notifications require adding to Home Screen: tap the <span className="font-bold text-[#231F1D]">Share</span> icon in Safari, select <span className="font-bold text-[#231F1D]">"Add to Home Screen"</span>, then open the app from your home screen.
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="w-full py-2.5 rounded-xl font-bold uppercase tracking-[0.18em] text-xs text-[#6E655F] hover:text-[#231F1D] hover:bg-[#C4466F]/5 transition-colors border border-[rgba(240,213,222,0.8)] cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      );
    }

    // 3. Generic unsupported browser
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4">
        <div className="w-full max-w-lg bg-white/95 backdrop-blur-xl border border-[rgba(240,213,222,0.85)] rounded-2xl shadow-luxury p-6 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 bg-[#C4466F]/10 text-[#C4466F] rounded-full flex items-center justify-center">
              <Bell size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4466F] mb-0.5">
                Notifications Unavailable
              </p>
              <h3 className="font-serif italic text-lg font-bold text-[#231F1D] tracking-tight leading-snug">
                Browser Push Not Supported
              </h3>
              <p className="text-xs text-[#6E655F] mt-1 leading-relaxed">
                Your current browser does not support web push notifications. Please use Chrome, Edge, or Safari to receive booking notifications.
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-xl font-bold uppercase tracking-[0.18em] text-xs text-[#6E655F] hover:text-[#231F1D] hover:bg-[#C4466F]/5 transition-colors border border-[rgba(240,213,222,0.8)] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // If permission denied
  if (permission === 'denied' || step === 'denied') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4">
        <div className="w-full max-w-lg bg-white/90 backdrop-blur-xl border border-[rgba(240,213,222,0.75)] rounded-2xl shadow-luxury p-6 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 bg-[#C4466F]/10 text-[#C4466F] rounded-full flex items-center justify-center">
              <Bell size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4466F] mb-0.5">
                Notifications Blocked
              </p>
              <p className="text-xs text-[#6E655F] leading-relaxed">
                To enable notifications, open your browser settings and allow
                notifications for this site.
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="w-full py-3 rounded-xl font-bold uppercase tracking-[0.18em] text-xs text-[#6E655F] hover:text-[#231F1D] hover:bg-[#C4466F]/5 transition-colors border border-[rgba(240,213,222,0.8)] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  const handleEnable = async () => {
    const ok = await subscribe(customerPhone);
    setStep(ok ? 'success' : 'denied');
  };

  // ── Prompt card ─────────────────────────────────────────────────────────────
  if (step === 'prompt') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4">
        <div className="w-full max-w-lg bg-white/90 backdrop-blur-xl border border-[rgba(240,213,222,0.75)] rounded-2xl shadow-luxury p-6 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 bg-[#C4466F]/10 text-[#C4466F] rounded-full flex items-center justify-center">
              <Bell size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4466F] mb-0.5">
                Notifications
              </p>
              <h3 className="font-serif italic text-xl font-bold text-[#231F1D] tracking-tight leading-tight">
                {title}
              </h3>
              <p className="text-xs text-[#6E655F] mt-1.5 leading-relaxed font-sans">
                {description}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleEnable}
              disabled={isLoading}
              className="w-full bg-[#C4466F] hover:bg-[#A83257] text-white py-3.5 rounded-xl font-bold uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98] shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? 'Setting up…' : 'Enable Notifications'}
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-2.5 rounded-xl font-bold uppercase tracking-[0.18em] text-xs text-[#6E655F] hover:text-[#231F1D] hover:bg-[#C4466F]/5 transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Success card ────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4">
      <div className="w-full max-w-lg bg-[rgba(44,34,30,0.92)] backdrop-blur-xl text-white border border-white/15 rounded-2xl shadow-luxury p-5 flex items-center gap-4">
        <div className="shrink-0 w-10 h-10 bg-[#C4466F]/20 text-[#E8829F] rounded-full flex items-center justify-center">
          <Bell size={18} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50 mb-0.5">
            All Set
          </p>
          <p className="font-medium text-sm tracking-tight">
            You'll be notified when your booking is approved or updated.
          </p>
        </div>
      </div>
    </div>
  );
}
