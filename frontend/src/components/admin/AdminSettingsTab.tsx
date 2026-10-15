import React, { useState, useEffect } from 'react';
import { Upload, Bell, BellOff, Volume2, Loader2, Check, AlertCircle, Save, Clock, Calendar, Plus, Trash2, X } from 'lucide-react';
import { Tenant } from '../../types';
import * as api from '../../api/client';
import { useAdminPushNotifications } from '../../hooks/useAdminPushNotifications';
import { playNotificationSound } from '../../utils/notificationSound';

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

  const [name, setName] = useState(tenant?.name || '');
  const [primaryColor, setPrimaryColor] = useState(tenant?.branding?.primaryColor || '#B08968');
  const [emailFromName, setEmailFromName] = useState(tenant?.branding?.emailFromName || '');
  const [emailReplyTo, setEmailReplyTo] = useState(tenant?.branding?.emailReplyTo || '');
  const [whatsappSenderNumber, setWhatsappSenderNumber] = useState(tenant?.branding?.whatsappSenderNumber || '');

  const [locale, setLocale] = useState<'en' | 'sw'>(tenant?.locale || 'en');
  const [mpesaTillNumber, setMpesaTillNumber] = useState(tenant?.mpesaTillNumber || '');
  const [mpesaPaybillNumber, setMpesaPaybillNumber] = useState(tenant?.mpesaPaybillNumber || '');
  const [supportPhone, setSupportPhone] = useState(tenant?.supportPhone || '');
  const [supportEmail, setSupportEmail] = useState(tenant?.supportEmail || '');

  // Operating Hours & Booking Rules state
  const [workingHoursStart, setWorkingHoursStart] = useState(tenant?.workingHours?.start || '09:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState(tenant?.workingHours?.end || '18:00');
  const [slotInterval, setSlotInterval] = useState<number>(tenant?.bookingRules?.slotInterval || 30);
  const [bufferMinutes, setBufferMinutes] = useState<number>(tenant?.bookingRules?.bufferMinutes || 0);
  const [minNoticeHours, setMinNoticeHours] = useState<number>(
    tenant?.bookingRules?.minNoticeHours !== undefined ? tenant.bookingRules.minNoticeHours : 2
  );
  const [holidays, setHolidays] = useState<string[]>(tenant?.bookingRules?.holidays || []);
  const [newHoliday, setNewHoliday] = useState('');

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state if tenant updates
  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setPrimaryColor(tenant.branding?.primaryColor || '#B08968');
      setEmailFromName(tenant.branding?.emailFromName || '');
      setEmailReplyTo(tenant.branding?.emailReplyTo || '');
      setWhatsappSenderNumber(tenant.branding?.whatsappSenderNumber || '');
      setLocale(tenant.locale || 'en');
      setMpesaTillNumber(tenant.mpesaTillNumber || '');
      setMpesaPaybillNumber(tenant.mpesaPaybillNumber || '');
      setSupportPhone(tenant.supportPhone || '');
      setSupportEmail(tenant.supportEmail || '');
      setWorkingHoursStart(tenant.workingHours?.start || '09:00');
      setWorkingHoursEnd(tenant.workingHours?.end || '18:00');
      setSlotInterval(tenant.bookingRules?.slotInterval || 30);
      setBufferMinutes(tenant.bookingRules?.bufferMinutes || 0);
      setMinNoticeHours(
        tenant.bookingRules?.minNoticeHours !== undefined ? tenant.bookingRules.minNoticeHours : 2
      );
      setHolidays(tenant.bookingRules?.holidays || []);
    }
  }, [tenant]);

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday) return;
    if (holidays.includes(newHoliday)) {
      triggerToast('Holiday date already added', 'error');
      return;
    }
    setHolidays(prev => [...prev, newHoliday].sort());
    setNewHoliday('');
  };

  const handleRemoveHoliday = (dateStr: string) => {
    setHolidays(prev => prev.filter(d => d !== dateStr));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateTenantSettings(ownerToken, {
        name: name.trim(),
        workingHours: {
          start: workingHoursStart,
          end: workingHoursEnd,
        },
        bookingRules: {
          slotInterval: Number(slotInterval),
          bufferMinutes: Number(bufferMinutes),
          minNoticeHours: Number(minNoticeHours),
          holidays,
        },
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

            {/* Operating Hours & Booking Engine Rules Card */}
            <div className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500 border-b border-brand-gray-100 pb-2">
                Operating Hours & Booking Engine Rules
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Salon Working Hours */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 flex items-center gap-1.5">
                    <Clock size={12} className="text-brand-gray-400" />
                    <span>Salon Default Operating Hours</span>
                  </label>
                  <div className="flex items-center gap-2 max-w-sm">
                    <input
                      type="time"
                      value={workingHoursStart}
                      onChange={e => setWorkingHoursStart(e.target.value)}
                      className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                    />
                    <span className="text-xs font-bold text-brand-gray-400">to</span>
                    <input
                      type="time"
                      value={workingHoursEnd}
                      onChange={e => setWorkingHoursEnd(e.target.value)}
                      className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                    />
                  </div>
                </div>

                {/* Slot Interval */}
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                    Slot Step Interval
                  </label>
                  <select
                    value={slotInterval}
                    onChange={e => setSlotInterval(Number(e.target.value))}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none bg-white cursor-pointer"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes (Standard)</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes (Hourly)</option>
                  </select>
                  <p className="text-[11px] text-brand-gray-400">Frequency of selectable booking start times</p>
                </div>

                {/* Buffer Time */}
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                    Buffer Time Between Appointments
                  </label>
                  <select
                    value={bufferMinutes}
                    onChange={e => setBufferMinutes(Number(e.target.value))}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none bg-white cursor-pointer"
                  >
                    <option value={0}>No Buffer (0 min)</option>
                    <option value={5}>5 Minutes</option>
                    <option value={10}>10 Minutes</option>
                    <option value={15}>15 Minutes (Prep/Clean)</option>
                    <option value={30}>30 Minutes</option>
                  </select>
                  <p className="text-[11px] text-brand-gray-400">Rest or sanitation buffer automatically held between clients</p>
                </div>

                {/* Minimum Notice */}
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                    Minimum Advance Notice
                  </label>
                  <select
                    value={minNoticeHours}
                    onChange={e => setMinNoticeHours(Number(e.target.value))}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none bg-white cursor-pointer"
                  >
                    <option value={0}>Instant / No Notice (0 hrs)</option>
                    <option value={1}>1 Hour Advance Notice</option>
                    <option value={2}>2 Hours Advance Notice (Default)</option>
                    <option value={4}>4 Hours Advance Notice</option>
                    <option value={12}>12 Hours Advance Notice</option>
                    <option value={24}>24 Hours Advance Notice</option>
                  </select>
                  <p className="text-[11px] text-brand-gray-400">Prevent last-minute bookings without enough prep time</p>
                </div>

                {/* Salon Closed Dates & Holidays */}
                <div className="space-y-2 sm:col-span-2 pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 flex items-center gap-1.5">
                    <Calendar size={12} className="text-brand-gray-400" />
                    <span>Salon Closed Dates & Holidays</span>
                  </label>
                  <div className="flex items-center gap-2 max-w-md">
                    <input
                      type="date"
                      value={newHoliday}
                      onChange={e => setNewHoliday(e.target.value)}
                      className="border border-brand-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-brand-black focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddHoliday}
                      disabled={!newHoliday}
                      className="px-3.5 py-2 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Plus size={13} />
                      <span>Add Date</span>
                    </button>
                  </div>

                  {holidays.length === 0 ? (
                    <p className="text-xs text-brand-gray-400 italic">No closed dates scheduled. Salon is open year-round.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {holidays.map(dateStr => (
                        <div
                          key={dateStr}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold"
                        >
                          <span>{dateStr}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveHoliday(dateStr)}
                            className="p-0.5 hover:bg-red-200/60 rounded-md transition-all text-red-700"
                            title="Remove holiday"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

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
