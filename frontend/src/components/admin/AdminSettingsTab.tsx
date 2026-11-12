import React, { useState, useEffect } from 'react';
import { Upload, Bell, BellOff, Volume2, Loader2, Check, AlertCircle, Save, MessageSquare, Smartphone, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Tenant } from '../../types';
import * as api from '../../api/client';
import { useAdminPushNotifications } from '../../hooks/useAdminPushNotifications';
import { playNotificationSound } from '../../utils/notificationSound';
import { ScheduleSettings } from './ScheduleSettings';

interface AdminSettingsTabProps {
  tenant: Tenant | null;
  ownerToken: string;
  onTenantUpdated: (tenant: Tenant) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminSettingsTab({
  tenant,
  ownerToken,
  onTenantUpdated,
  triggerToast,
}: AdminSettingsTabProps) {
  const adminPush = useAdminPushNotifications();

  const getActiveBrandColor = (c?: string) => {
    const hex = c?.toLowerCase();
    if (!hex || hex === '#b08968' || hex === '#9a5532' || hex === '#8c4a32' || hex === '#b86b7c') {
      return '#C4466F';
    }
    return c;
  };

  const [name, setName] = useState(tenant?.name || '');
  const [primaryColor, setPrimaryColor] = useState(getActiveBrandColor(tenant?.branding?.primaryColor));
  const [emailFromName, setEmailFromName] = useState(tenant?.branding?.emailFromName || '');
  const [emailReplyTo, setEmailReplyTo] = useState(tenant?.branding?.emailReplyTo || '');
  const [whatsappSenderNumber, setWhatsappSenderNumber] = useState(tenant?.branding?.whatsappSenderNumber || '');

  const [locale, setLocale] = useState<'en' | 'sw'>(tenant?.locale || 'en');
  const [mpesaTillNumber, setMpesaTillNumber] = useState(tenant?.mpesaTillNumber || '');
  const [mpesaPaybillNumber, setMpesaPaybillNumber] = useState(tenant?.mpesaPaybillNumber || '');
  const [supportPhone, setSupportPhone] = useState(tenant?.supportPhone || '');
  const [supportEmail, setSupportEmail] = useState(tenant?.supportEmail || '');

  // SMS: loaded from the owner-only settings endpoint (the public tenant never carries these).
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [smsLoaded, setSmsLoaded] = useState(false);
  const [smsCredits, setSmsCredits] = useState<number | null>(null);
  const [smsLowBalance, setSmsLowBalance] = useState(false);
  const [smsTopUpContact, setSmsTopUpContact] = useState<string>('');
  const [showTopUpInfo, setShowTopUpInfo] = useState(false);
  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [smsTesting, setSmsTesting] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getTenantSettings(ownerToken)
      .then((s) => {
        if (cancelled) return;
        setSmsEnabled(!!s.smsEnabled);
        setSmsAvailable(!!s.smsAvailable);
        if (typeof (s as any).smsCredits === 'number') setSmsCredits((s as any).smsCredits);
        if (typeof (s as any).smsLowBalance === 'boolean') setSmsLowBalance((s as any).smsLowBalance);
        if ((s as any).smsTopUpContact) setSmsTopUpContact((s as any).smsTopUpContact);
        setSmsLoaded(true);
      })
      .catch((err) => console.error('Failed to load SMS settings:', err));
    return () => {
      cancelled = true;
    };
  }, [ownerToken]);

  // Sync state if tenant updates
  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setPrimaryColor(getActiveBrandColor(tenant.branding?.primaryColor));
      setEmailFromName(tenant.branding?.emailFromName || '');
      setEmailReplyTo(tenant.branding?.emailReplyTo || '');
      setWhatsappSenderNumber(tenant.branding?.whatsappSenderNumber || '');
      setLocale(tenant.locale || 'en');
      setMpesaTillNumber(tenant.mpesaTillNumber || '');
      setMpesaPaybillNumber(tenant.mpesaPaybillNumber || '');
      setSupportPhone(tenant.supportPhone || '');
      setSupportEmail(tenant.supportEmail || '');
    }
  }, [tenant]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateTenantSettings(ownerToken, {
        name: name.trim(),
        branding: {
          primaryColor,
          emailFromName: emailFromName.trim(),
          emailReplyTo: emailReplyTo.trim(),
          whatsappSenderNumber: whatsappSenderNumber.trim(),
        },
        locale,
        mpesaTillNumber: mpesaTillNumber.trim(),
        mpesaPaybillNumber: mpesaPaybillNumber.trim(),
        supportPhone: supportPhone.trim(),
        supportEmail: supportEmail.trim(),
        // Only send the switch once we know its real value, so a failed load can't switch it off.
        ...(smsLoaded ? { smsEnabled } : {}),
      });
      onTenantUpdated(updated);
      if (typeof (updated as any).smsCredits === 'number') setSmsCredits((updated as any).smsCredits);
      if (typeof (updated as any).smsLowBalance === 'boolean') setSmsLowBalance((updated as any).smsLowBalance);
      triggerToast('Salon settings updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update settings');
      triggerToast(err.message || 'Failed to update settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!smsTestPhone.trim()) return;
    setSmsTesting(true);
    try {
      await api.sendTestSms(ownerToken, smsTestPhone.trim());
      setSmsCredits(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      triggerToast('Test SMS sent. Check your phone.', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'Failed to send test SMS', 'error');
    } finally {
      setSmsTesting(false);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;
    setUploadingLogo(true);
    try {
      const result = await api.uploadBrandingLogo(ownerToken, logoFile);
      onTenantUpdated({
        ...tenant!,
        branding: result.branding,
      });
      setLogoFile(null);
      triggerToast('Logo updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUploadFavicon = async () => {
    if (!faviconFile) return;
    setUploadingFavicon(true);
    try {
      const result = await api.uploadBrandingFavicon(ownerToken, faviconFile);
      onTenantUpdated({
        ...tenant!,
        branding: result.branding,
      });
      setFaviconFile(null);
      triggerToast('Favicon updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Failed to upload favicon', 'error');
    } finally {
      setUploadingFavicon(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-7xl">
      {/* Header with Title & Quick Save Action */}
      <div className="border-b border-brand-gray-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-black uppercase text-brand-black">Salon Profile & Settings</h2>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-400 mt-1">
            Branding, communications, payment identifiers, and system preferences
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          className="hidden sm:inline-flex items-center gap-2 px-6 py-2.5 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shadow-xs cursor-pointer self-start sm:self-auto"
        >
          {saving ? <Loader2 size={13} className="animate-spin text-white" /> : <Save size={13} />}
          <span>Save Changes</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Settings 2-Column Layout */}
      <form onSubmit={handleSaveSettings}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* ── LEFT COLUMN: Core Operations, Rules & Payments ── */}
          <div className="space-y-6">
            {/* Salon Identity Card */}
            <div className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500 border-b border-brand-gray-100 pb-2">
                General Identity & Color
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Salon Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Primary Brand Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 border border-brand-gray-200 rounded-xl cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="flex-1 border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-mono font-semibold focus:border-brand-black focus:outline-none uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Support Phone</label>
                  <input
                    type="text"
                    placeholder="0721 530 120"
                    value={supportPhone}
                    onChange={e => setSupportPhone(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Support Email</label>
                  <input
                    type="email"
                    placeholder="support@salon.com"
                    value={supportEmail}
                    onChange={e => setSupportEmail(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Dedicated Schedule Settings Section */}
            <ScheduleSettings
              tenant={tenant}
              ownerToken={ownerToken}
              onTenantUpdated={onTenantUpdated}
              triggerToast={triggerToast}
            />


            {/* Payments & Regional Card */}
            <div className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500 border-b border-brand-gray-100 pb-2">
                M-Pesa Payments & Localization
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Buy Goods Till No.</label>
                  <input
                    type="text"
                    placeholder="Till Number"
                    value={mpesaTillNumber}
                    onChange={e => setMpesaTillNumber(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-mono font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Paybill Business No.</label>
                  <input
                    type="text"
                    placeholder="Paybill Number"
                    value={mpesaPaybillNumber}
                    onChange={e => setMpesaPaybillNumber(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-mono font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Default Language</label>
                  <select
                    value={locale}
                    onChange={e => setLocale(e.target.value as 'en' | 'sw')}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none bg-white cursor-pointer"
                  >
                    <option value="en">English (en)</option>
                    <option value="sw">Kiswahili (sw)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bottom Save Changes Button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-8 py-3 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin text-white" />
              ) : (
                <Save size={14} />
              )}
              <span>Save Changes</span>
            </button>
          </div>

          {/* ── RIGHT COLUMN: Communications, Media & Security ── */}
          <div className="space-y-6">
            {/* Messaging & Notifications Card */}
            <div className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500 border-b border-brand-gray-100 pb-2">
                Email & WhatsApp Notifications
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Email Sender Name</label>
                  <input
                    type="text"
                    placeholder="Flo Sisterlocks"
                    value={emailFromName}
                    onChange={e => setEmailFromName(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Email Reply-To</label>
                  <input
                    type="email"
                    placeholder="reply@flosisterlocks.com"
                    value={emailReplyTo}
                    onChange={e => setEmailReplyTo(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">WhatsApp Sender Phone</label>
                  <input
                    type="text"
                    placeholder="+254721530120"
                    value={whatsappSenderNumber}
                    onChange={e => setWhatsappSenderNumber(e.target.value)}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* SMS Notifications Card */}
            <div className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-gray-100 pb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
                  SMS Notifications
                </p>
                {smsLoaded && smsAvailable && smsCredits !== null && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        smsCredits === 0
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : smsLowBalance
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {smsCredits} SMS credit{smsCredits === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTopUpInfo(prev => !prev)}
                      className="text-xs font-bold bg-brand-black text-white hover:bg-neutral-800 px-3 py-1 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Top up</span>
                      {showTopUpInfo ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>

              {!smsLoaded ? (
                <p className="text-xs font-semibold text-brand-gray-500">Loading SMS settings…</p>
              ) : !smsAvailable ? (
                <p className="text-xs font-semibold text-brand-gray-500">
                  SMS is not set up on the server yet. Once it is connected, you can switch it on here.
                </p>
              ) : (
                <>
                  {/* Low Balance Warning */}
                  {smsCredits !== null && smsCredits <= 10 && (
                    <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                      smsCredits === 0
                        ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                    }`}>
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <div className="flex-1">
                        <span className="font-bold">
                          {smsCredits === 0 ? 'Out of SMS credits!' : 'SMS credits running low!'}
                        </span>
                        <p className="mt-0.5 text-brand-gray-600">
                          {smsCredits === 0
                            ? 'Client booking notifications are currently paused. Top up to resume automated text messages.'
                            : `You have ${smsCredits} message${smsCredits === 1 ? '' : 's'} remaining. Top up to keep booking notifications flowing smoothly.`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTopUpInfo(true)}
                        className="text-xs font-bold underline cursor-pointer shrink-0"
                      >
                        Top up now
                      </button>
                    </div>
                  )}

                  {/* Top Up Instructions Drawer */}
                  {showTopUpInfo && (
                    <div className="p-4 bg-brand-gray-50 border border-brand-gray-200 rounded-xl space-y-3.5 text-xs animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase tracking-wider text-brand-gray-700 flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4 text-emerald-600" />
                          How to Top Up SMS Credits
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-md">
                          1 Credit = 1 SMS
                        </span>
                      </div>

                      {/* Bundles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-2.5 bg-white border border-brand-gray-200 rounded-lg text-center">
                          <span className="text-xs font-bold block text-brand-black">100 SMS</span>
                          <span className="text-[11px] font-medium text-brand-gray-500">KES 100</span>
                        </div>
                        <div className="p-2.5 bg-white border border-brand-gray-200 rounded-lg text-center">
                          <span className="text-xs font-bold block text-brand-black">250 SMS</span>
                          <span className="text-[11px] font-medium text-brand-gray-500">KES 250</span>
                        </div>
                        <div className="p-2.5 bg-white border border-emerald-300 bg-emerald-50/30 rounded-lg text-center relative">
                          <span className="absolute -top-1.5 -right-1 text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.2 rounded-full">
                            Save 10%
                          </span>
                          <span className="text-xs font-bold block text-brand-black">500 SMS</span>
                          <span className="text-[11px] font-medium text-brand-gray-500">KES 450</span>
                        </div>
                        <div className="p-2.5 bg-white border border-brand-gray-200 rounded-lg text-center">
                          <span className="text-xs font-bold block text-brand-black">1,000 SMS</span>
                          <span className="text-[11px] font-medium text-brand-gray-500">KES 850</span>
                        </div>
                      </div>

                      {/* Payment Steps */}
                      <div className="p-3 bg-white border border-brand-gray-200 rounded-lg space-y-1.5 text-brand-gray-700">
                        <p className="font-semibold text-brand-black">M-Pesa Payment Instructions:</p>
                        <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-brand-gray-600">
                          <li>Go to <strong>M-Pesa</strong> &gt; <strong>Lipa na M-Pesa</strong> &gt; <strong>Buy Goods / Paybill</strong></li>
                          <li>
                            Use your salon account code as the reference:{' '}
                            <code className="px-1.5 py-0.5 bg-brand-gray-100 rounded text-brand-black font-bold">
                              {tenant?.slug ? tenant.slug.toUpperCase() : 'YOUR-SALON-SLUG'}
                            </code>
                          </li>
                          <li>Your credits will be activated immediately upon confirmation.</li>
                        </ol>
                      </div>

                      {/* WhatsApp / Direct Support */}
                      {smsTopUpContact && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-brand-gray-500">Need instant assistance?</span>
                          <a
                            href={`https://wa.me/${smsTopUpContact.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              `Hi, I would like to top up SMS credits for ${tenant?.name || 'my salon'} (Account: ${tenant?.slug?.toUpperCase()}).`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 underline"
                          >
                            <span>WhatsApp Support ({smsTopUpContact})</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsEnabled}
                      onChange={e => setSmsEnabled(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-brand-black"
                    />
                    <span className="text-sm font-semibold">
                      Text customers about their bookings
                      <span className="block text-xs font-medium text-brand-gray-500 mt-0.5">
                        Sends a warm SMS when a booking is received, confirmed, moved or cancelled, and a reminder the
                        day before. Each message starts with your salon name.
                      </span>
                    </span>
                  </label>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Send a test SMS to</label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        placeholder="0712 345 678"
                        value={smsTestPhone}
                        onChange={e => setSmsTestPhone(e.target.value)}
                        className="flex-1 border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSendTestSms}
                        disabled={smsTesting || !smsTestPhone.trim() || smsCredits === 0}
                        className="px-4 py-2 rounded-xl border border-brand-gray-200 text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-brand-gray-50 cursor-pointer"
                      >
                        {smsTesting ? 'Sending…' : 'Send test'}
                      </button>
                    </div>
                    {smsCredits === 0 && (
                      <p className="text-[11px] text-rose-600 font-medium">
                        You need at least 1 credit to send a test message.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Media Uploads Card */}
            <div className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500 border-b border-brand-gray-100 pb-2">
                Salon Logo & Favicon Assets
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Logo Upload */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Logo (Square PNG/JPG, min 200x200)
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-brand-gray-200 bg-brand-gray-50 shrink-0 flex items-center justify-center">
                      <img
                        src={tenant?.branding?.logoUrl || '/logo-bg.jpg'}
                        alt="Logo"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => setLogoFile(e.target.files?.[0] || null)}
                      className="text-xs text-brand-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:border-brand-gray-200 file:text-xs file:font-bold file:bg-brand-gray-50 file:text-brand-black hover:file:bg-brand-gray-100"
                    />
                  </div>
                  {logoFile && (
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={handleUploadLogo}
                      className="px-3 py-1.5 bg-brand-black text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      <span>Upload Logo</span>
                    </button>
                  )}
                </div>

                {/* Favicon Upload */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Favicon (ICO/PNG, 32x32)
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-brand-gray-200 bg-brand-gray-50 shrink-0 flex items-center justify-center">
                      {tenant?.branding?.faviconUrl ? (
                        <img src={tenant.branding.faviconUrl} alt="Favicon" className="w-6 h-6 object-contain" />
                      ) : (
                        <span className="text-xs text-brand-gray-400">None</span>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => setFaviconFile(e.target.files?.[0] || null)}
                      className="text-xs text-brand-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:border-brand-gray-200 file:text-xs file:font-bold file:bg-brand-gray-50 file:text-brand-black hover:file:bg-brand-gray-100"
                    />
                  </div>
                  {faviconFile && (
                    <button
                      type="button"
                      disabled={uploadingFavicon}
                      onClick={handleUploadFavicon}
                      className="px-3 py-1.5 bg-brand-black text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      {uploadingFavicon ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      <span>Upload Favicon</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Password Management */}
            <ChangePasswordCard ownerToken={ownerToken} triggerToast={triggerToast} />
          </div>
        </div>
      </form>
    </div>
  );
}

function ChangePasswordCard({
  ownerToken,
  triggerToast,
}: {
  ownerToken: string;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const result = await api.changeOwnerPassword(currentPassword, newPassword);
      triggerToast(result.message || 'Password changed successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
      triggerToast(err.message || 'Failed to change password', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4"
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        }
      }}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">Security Credentials</p>
        <p className="font-serif font-bold text-lg text-brand-black mt-0.5">Change Admin Password</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4 max-w-md">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Current Password</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={e => {
              setCurrentPassword(e.target.value);
              setError(null);
            }}
            placeholder="••••••••"
            className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">New Password (8+ chars)</label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={e => {
              setNewPassword(e.target.value);
              setError(null);
            }}
            placeholder="••••••••"
            className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Confirm New Password</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={e => {
              setConfirmPassword(e.target.value);
              setError(null);
            }}
            placeholder="••••••••"
            className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={saving}
          className="px-5 py-2.5 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        >
          {saving ? <Loader2 size={13} className="animate-spin text-white" /> : <Save size={13} />}
          <span>Update Password</span>
        </button>
      </div>
    </div>
  );
}
