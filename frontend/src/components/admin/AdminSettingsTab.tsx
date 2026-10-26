import React, { useState, useEffect } from 'react';
import { Upload, Bell, BellOff, Volume2, Loader2, Check, AlertCircle, Save } from 'lucide-react';
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
              <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500 border-b border-brand-gray-100 pb-2">
                SMS Notifications
              </p>

              {!smsLoaded ? (
                <p className="text-xs font-semibold text-brand-gray-500">Loading SMS settings…</p>
              ) : !smsAvailable ? (
                <p className="text-xs font-semibold text-brand-gray-500">
                  SMS is not set up on the server yet. Once it is connected, you can switch it on here.
                </p>
              ) : (
                <>
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
                        Sends a short SMS when a booking is received, confirmed, changed or cancelled, and a reminder the
                        day before. Each message starts with your salon name. Remember to save settings after changing this.
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
                        disabled={smsTesting || !smsTestPhone.trim()}
                        className="px-4 py-2 rounded-xl border border-brand-gray-200 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                      >
                        {smsTesting ? 'Sending…' : 'Send test'}
                      </button>
                    </div>
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
