import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, User, ArrowLeft, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTenant } from '../hooks/useTenant';
import { Tenant, AttendantSession } from '../types';
import * as api from '../api/client';

interface AdminPortalProps {
  initialTab?: 'owner' | 'staff';
  onOwnerLoginSuccess: (token: string, tenant: Tenant) => void;
  onStaffLoginSuccess: (session: AttendantSession) => void;
}

export function AdminPortal({
  initialTab = 'owner',
  onOwnerLoginSuccess,
  onStaffLoginSuccess,
}: AdminPortalProps) {
  const { tenant, tenantSlug, navigate } = useTenant();

  const [tab, setTab] = useState<'owner' | 'staff'>(initialTab);

  // Sync tab with initialTab prop if it changes
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Owner state
  const [ownerSlug, setOwnerSlug] = useState(tenantSlug || localStorage.getItem('ownerTenantSlug') || 'flo-sisterlocks');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockoutMinutes, setLockoutMinutes] = useState<number | null>(null);

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Staff state
  const [staffSlug, setStaffSlug] = useState(tenantSlug || localStorage.getItem('staffTenantSlug') || 'flo-sisterlocks');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffPinError, setStaffPinError] = useState(false);

  useEffect(() => {
    if (tenantSlug) {
      setOwnerSlug(tenantSlug);
      setStaffSlug(tenantSlug);
    }
  }, [tenantSlug]);

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerSlug.trim()) return;
    setOwnerLoading(true);
    setOwnerError(null);
    setRemainingAttempts(null);
    setLockoutMinutes(null);

    try {
      const result = await api.loginOwner({
        slug: ownerSlug.trim(),
        email: ownerEmail.trim(),
        password: ownerPassword,
      });
      localStorage.setItem('ownerToken', result.token);
      localStorage.setItem('ownerTenantSlug', result.tenant.slug);
      api.setApiTenantSlug(result.tenant.slug);
      api.setApiAuthToken(result.token);
      onOwnerLoginSuccess(result.token, result.tenant);
    } catch (err: any) {
      setOwnerError(err.message || 'Invalid login credentials');
      if (err.remainingAttempts !== undefined) setRemainingAttempts(err.remainingAttempts);
      if (err.lockoutMinutes !== undefined) setLockoutMinutes(err.lockoutMinutes);
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleStaffSubmit = async () => {
    if (!staffSlug || !staffUsername || staffPin.length < 4) return;
    setStaffLoading(true);
    setStaffPinError(false);

    try {
      api.setApiTenantSlug(staffSlug);
      const result = await api.loginAttendant(staffUsername.trim(), staffPin);
      localStorage.setItem('attendantToken', result.token);
      localStorage.setItem('staffTenantSlug', staffSlug);
      api.setApiAuthToken(result.token);
      const session: AttendantSession = {
        _id: result.attendant._id,
        name: result.attendant.name,
        token: result.token,
      };
      onStaffLoginSuccess(session);
    } catch (err: any) {
      setStaffPinError(true);
      setStaffPin('');
    } finally {
      setStaffLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerSlug || !forgotEmail) return;
    setForgotLoading(true);
    setForgotError(null);
    setForgotMessage(null);

    try {
      const res = await api.forgotOwnerPassword(ownerSlug.trim(), forgotEmail.trim());
      setForgotMessage(res.message || 'Password reset link sent to your email.');
      setForgotEmail('');
    } catch (err: any) {
      setForgotError(err.message || 'Failed to send password reset email.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-white flex flex-col justify-center items-center px-4 py-12">
      {/* Return to Customer Salon */}
      <div className="w-full max-w-md mb-6 flex justify-between items-center">
        <button
          onClick={() => navigate('customer', tenantSlug || undefined)}
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-gray-500 hover:text-brand-black transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Salon</span>
        </button>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-brand-gray-100 text-brand-gray-700">
          <Shield size={12} />
          <span>Staff & Admin</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-brand-white border-2 border-brand-black rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-8 pb-6 border-b border-brand-black/10 text-center space-y-3 bg-brand-gray-50/50">
          <div className="h-16 w-16 mx-auto flex items-center justify-center rounded-full border-2 border-brand-black/10 overflow-hidden bg-brand-white shadow-sm">
            <img
              src={tenant?.branding?.logoUrl || '/logo-bg.jpg'}
              alt={tenant?.name || 'Salon Logo'}
              className="h-full w-full object-contain p-1"
            />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-black tracking-tight text-brand-black">
              {tenant?.name || 'Studio Management'}
            </h1>
            <p className="text-xs uppercase tracking-[0.25em] font-black text-brand-gray-500 mt-1">
              Internal Portal
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 border-b-2 border-brand-black/10 bg-brand-gray-50/30">
          <button
            type="button"
            onClick={() => {
              setTab('owner');
              navigate('admin', ownerSlug || undefined);
            }}
            className={`py-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${
              tab === 'owner' ? 'text-brand-black bg-brand-white' : 'text-brand-gray-400 hover:text-brand-black'
            }`}
          >
            Owner Login
            {tab === 'owner' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-black" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('staff');
              navigate('staff', staffSlug || undefined);
            }}
            className={`py-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${
              tab === 'staff' ? 'text-brand-black bg-brand-white' : 'text-brand-gray-400 hover:text-brand-black'
            }`}
          >
            Staff PIN
            {tab === 'staff' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-black" />}
          </button>
        </div>

        <div className="p-8 space-y-6">
          {tab === 'owner' ? (
            /* ── Owner Login Form ── */
            <form onSubmit={handleOwnerSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-gray-600 block">
                  Salon ID (Slug)
                </label>
                <input
                  type="text"
                  required
                  value={ownerSlug}
                  onChange={e => {
                    setOwnerSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    setOwnerError(null);
                  }}
                  placeholder="e.g. flo-sisterlocks"
                  disabled={!!tenantSlug}
                  className="w-full bg-brand-white border-2 border-brand-black/20 focus:border-brand-black p-3.5 text-sm font-medium rounded-lg focus:outline-none transition-colors disabled:bg-brand-gray-100 disabled:text-brand-gray-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-gray-600 block">
                  Owner Email
                </label>
                <input
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={e => {
                    setOwnerEmail(e.target.value);
                    setOwnerError(null);
                  }}
                  placeholder="owner@example.com"
                  className="w-full bg-brand-white border-2 border-brand-black/20 focus:border-brand-black p-3.5 text-sm font-medium rounded-lg focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-gray-600 block">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={ownerPassword}
                  onChange={e => {
                    setOwnerPassword(e.target.value);
                    setOwnerError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full bg-brand-white border-2 border-brand-black/20 focus:border-brand-black p-3.5 text-sm font-medium rounded-lg focus:outline-none transition-colors"
                />
              </div>

              {/* Error messages / lockout */}
              {ownerError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-red-600 text-xs font-bold">
                    <AlertCircle size={15} />
                    <span>{ownerError}</span>
                  </div>
                  {remainingAttempts !== null && remainingAttempts > 0 && (
                    <p className="text-[10px] font-bold text-amber-700 pl-6 uppercase tracking-wider">
                      ⚠ {remainingAttempts} attempt{remainingAttempts === 1 ? '' : 's'} remaining
                    </p>
                  )}
                  {lockoutMinutes !== null && (
                    <p className="text-[10px] font-bold text-red-700 pl-6 uppercase tracking-wider">
                      🔒 Account locked. Try again in {lockoutMinutes} min
                    </p>
                  )}
                </div>
              )}

              {/* Forgot Password */}
              {!showForgotPassword ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setForgotError(null);
                    setForgotMessage(null);
                  }}
                  className="text-[11px] font-black uppercase tracking-wider text-brand-gray-500 hover:text-brand-black transition-colors"
                >
                  Forgot password?
                </button>
              ) : (
                <div className="p-4 border-2 border-brand-black/20 rounded-lg space-y-3 bg-brand-gray-50">
                  <p className="text-xs font-black uppercase tracking-widest text-brand-black">Password Recovery</p>
                  <p className="text-xs text-brand-gray-600">Enter your owner email to receive a password reset link.</p>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="owner@example.com"
                    className="w-full bg-white border border-brand-black/20 p-2.5 text-xs rounded focus:outline-none focus:border-brand-black"
                  />
                  {forgotError && <p className="text-xs text-red-600 font-bold">{forgotError}</p>}
                  {forgotMessage && <p className="text-xs text-emerald-600 font-bold">{forgotMessage}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={forgotLoading || !forgotEmail}
                      onClick={handleForgotSubmit}
                      className="flex-1 py-2 text-xs font-black uppercase tracking-widest bg-brand-black text-white rounded hover:bg-brand-gray-800 disabled:opacity-40"
                    >
                      {forgotLoading ? 'Sending…' : 'Send Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(false)}
                      className="px-3 py-2 text-xs font-bold border border-brand-black/20 rounded hover:bg-brand-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={ownerLoading || lockoutMinutes !== null}
                className="w-full bg-brand-black text-white py-4 rounded-xl font-black uppercase tracking-[0.25em] text-xs transition-all hover:bg-brand-gray-800 active:scale-[0.98] disabled:opacity-40 shadow-md"
              >
                {ownerLoading ? 'Signing In…' : 'Sign In as Owner'}
              </button>
            </form>
          ) : (
            /* ── Staff PIN Login Form ── */
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-gray-600 block">
                  Salon ID (Slug)
                </label>
                <input
                  type="text"
                  required
                  value={staffSlug}
                  onChange={e => {
                    setStaffSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    setStaffPinError(false);
                  }}
                  placeholder="e.g. flo-sisterlocks"
                  disabled={!!tenantSlug}
                  className="w-full bg-brand-white border-2 border-brand-black/20 focus:border-brand-black p-3.5 text-sm font-medium rounded-lg focus:outline-none transition-colors disabled:bg-brand-gray-100 disabled:text-brand-gray-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-gray-600 block">
                  Staff Username
                </label>
                <input
                  type="text"
                  value={staffUsername}
                  onChange={e => {
                    setStaffUsername(e.target.value);
                    setStaffPinError(false);
                  }}
                  placeholder="e.g. flo"
                  className="w-full bg-brand-white border-2 border-brand-black/20 focus:border-brand-black p-3.5 text-sm font-black tracking-wider rounded-lg focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-gray-600 block">
                  Enter 4-6 Digit PIN
                </label>
                {/* PIN dot indicator */}
                <div className="flex justify-center gap-3 py-2">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                        i < staffPin.length ? 'bg-brand-black border-brand-black scale-110' : 'bg-transparent border-brand-gray-300'
                      }`}
                    />
                  ))}
                </div>

                {staffPinError && (
                  <p className="text-center text-xs font-bold text-red-600 uppercase tracking-wider">
                    Invalid staff credentials
                  </p>
                )}

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2 pt-2 max-w-xs mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        if (staffPin.length >= 6) return;
                        setStaffPin(p => p + String(n));
                        setStaffPinError(false);
                      }}
                      className="py-3.5 text-lg font-black rounded-lg border border-brand-black/20 hover:border-brand-black hover:bg-brand-gray-50 transition-all active:scale-95 shadow-sm"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setStaffPin('');
                      setStaffPinError(false);
                    }}
                    className="py-3.5 text-xs font-black uppercase tracking-wider rounded-lg border border-brand-black/20 hover:border-brand-black hover:bg-brand-gray-50 text-brand-gray-600 transition-all"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (staffPin.length >= 6) return;
                      setStaffPin(p => p + '0');
                      setStaffPinError(false);
                    }}
                    className="py-3.5 text-lg font-black rounded-lg border border-brand-black/20 hover:border-brand-black hover:bg-brand-gray-50 transition-all active:scale-95 shadow-sm"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffPin(p => p.slice(0, -1));
                      setStaffPinError(false);
                    }}
                    className="py-3.5 text-sm font-black rounded-lg border border-brand-black/20 hover:border-brand-black hover:bg-brand-gray-50 text-brand-gray-600 transition-all"
                  >
                    ⌫
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={staffLoading || !staffUsername || staffPin.length < 4 || !staffSlug}
                onClick={handleStaffSubmit}
                className="w-full bg-brand-black text-white py-4 rounded-xl font-black uppercase tracking-[0.25em] text-xs transition-all hover:bg-brand-gray-800 disabled:opacity-40 shadow-md"
              >
                {staffLoading ? 'Verifying PIN…' : 'Sign In as Staff'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
