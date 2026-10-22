import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
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
  const { permission, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [step, setStep] = useState<Step>('prompt');

  // Auto-dismiss after showing the success message
  useEffect(() => {
    if (step === 'success') {
      const t = setTimeout(onDismiss, 2500);
      return () => clearTimeout(t);
    }
  }, [step, onDismiss]);

  // Don't render if push isn't supported, already subscribed, or permission denied
  if (permission === 'unsupported' || permission === 'denied' || isSubscribed) {
    return null;
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
  if (step === 'success') {
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

  // ── Denied card ─────────────────────────────────────────────────────────────
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
