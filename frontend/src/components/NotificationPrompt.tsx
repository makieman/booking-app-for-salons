import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface NotificationPromptProps {
  customerPhone: string;
  onDismiss:     () => void;
}

type Step = 'prompt' | 'success' | 'denied';

export function NotificationPrompt({ customerPhone, onDismiss }: NotificationPromptProps) {
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
        <div className="w-full max-w-lg bg-brand-white border-2 border-brand-black shadow-2xl p-6 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 bg-brand-black rounded-full flex items-center justify-center">
              <Bell size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-brand-gray-400 mb-0.5">
                Notifications
              </p>
              <h3 className="font-serif italic text-xl font-black tracking-tight leading-tight">
                Stay in the Loop
              </h3>
              <p className="text-xs text-brand-gray-500 mt-1.5 leading-relaxed">
                Get notified the moment Flo confirms or updates your appointment.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleEnable}
              disabled={isLoading}
              className="w-full bg-brand-black text-white py-4 font-black uppercase tracking-[0.25em] text-xs transition-all hover:tracking-[0.35em] active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? 'Setting up…' : 'Enable Notifications'}
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-3 font-black uppercase tracking-[0.25em] text-xs text-brand-gray-400 hover:text-brand-black transition-colors"
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
        <div className="w-full max-w-lg bg-brand-black text-white border-2 border-brand-black shadow-2xl p-6 flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
            <Bell size={18} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/50 mb-0.5">
              All Set
            </p>
            <p className="font-black text-sm tracking-tight">
              You'll be notified the moment your booking is updated.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Denied card ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4">
      <div className="w-full max-w-lg bg-brand-white border-2 border-brand-black shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 bg-brand-gray-100 rounded-full flex items-center justify-center">
            <Bell size={18} className="text-brand-gray-400" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-brand-gray-400 mb-0.5">
              Notifications Blocked
            </p>
            <p className="text-xs text-brand-gray-500 leading-relaxed">
              To enable notifications, open your browser settings and allow
              notifications for this site.
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="w-full py-3 font-black uppercase tracking-[0.25em] text-xs text-brand-gray-400 hover:text-brand-black transition-colors border border-brand-gray-100 hover:border-brand-black"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
