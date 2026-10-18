import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Calendar,
  AlertCircle,
  Scissors,
  Users,
  Settings,
  Bell,
  BellOff,
  Volume2,
  LogOut,
  ArrowLeft,
  X,
  Loader2,
  Search,
} from 'lucide-react';
import { Tenant } from '../../types';
import { playNotificationSound } from '../../utils/notificationSound';
import { useAdminPushNotifications } from '../../hooks/useAdminPushNotifications';

export type AdminTabKey = 'dashboard' | 'ledger' | 'pending' | 'services' | 'staff' | 'settings';

export interface AdminTabConfig {
  key: AdminTabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badgeCount?: number;
}

interface AdminLayoutProps {
  tenant: Tenant | null;
  activeTab: AdminTabKey;
  onTabChange: (tab: AdminTabKey) => void;
  pendingCount: number;
  onSignOut: () => void;
  onBackToSalon: () => void;
  adminPush: ReturnType<typeof useAdminPushNotifications>;
  showPushBanner: boolean;
  onDismissPushBanner: () => void;
  onEnablePushFromBanner: () => void;
  onOpenSearch?: () => void;
  children: React.ReactNode;
}

export function AdminLayout({
  tenant,
  activeTab,
  onTabChange,
  pendingCount,
  onSignOut,
  onBackToSalon,
  adminPush,
  showPushBanner,
  onDismissPushBanner,
  onEnablePushFromBanner,
  onOpenSearch,
  children,
}: AdminLayoutProps) {
  const tabs: AdminTabConfig[] = [
    { key: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { key: 'ledger', label: 'Ledger', icon: Calendar },
    { key: 'pending', label: 'Requests', icon: AlertCircle, badgeCount: pendingCount },
    { key: 'services', label: 'Services', icon: Scissors },
    { key: 'staff', label: 'Staff', icon: Users },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* ── Desktop Fixed Left Sidebar (240px wide, visible on lg+) ── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 bg-white border-r border-brand-gray-100 flex-col justify-between p-6 z-40 select-none shadow-sm">
        <div className="space-y-6">
          {/* Brand & Portal Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-brand-gray-100">
            <div className="h-10 w-10 rounded-xl overflow-hidden border border-brand-gray-200 bg-brand-gray-50 flex items-center justify-center shrink-0">
              <img
                src={tenant?.branding?.logoUrl || '/logo-bg.jpg'}
                alt={tenant?.name || 'Salon Logo'}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif font-black text-sm tracking-tight text-brand-black truncate">
                {tenant?.name || 'Salon Portal'}
              </h1>
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 mt-0.5">
                Admin Console
              </span>
            </div>
          </div>


          {/* Navigation Items */}
          <nav className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-400 px-3 pb-1">
              Navigation
            </p>
            {tabs.map(tab => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-black cursor-pointer ${
                    isActive
                      ? 'bg-brand-black text-white shadow-sm'
                      : 'text-brand-gray-600 hover:text-brand-black hover:bg-brand-gray-100/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-white text-brand-black' : 'bg-red-50 text-red-600 border border-red-200'
                      }`}
                    >
                      {tab.badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="space-y-3 pt-4 border-t border-brand-gray-100">
          {/* Push Notifications Configuration */}
          {adminPush.permission !== 'unsupported' && adminPush.permission !== 'denied' && (
            <div className="space-y-2 bg-brand-gray-50/70 p-3 rounded-xl border border-brand-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-brand-gray-600">Push Alerts</span>
                <button
                  type="button"
                  onClick={() => (adminPush.isSubscribed ? adminPush.unsubscribe() : adminPush.subscribe())}
                  disabled={adminPush.isLoading}
                  title={adminPush.isSubscribed ? 'Disable notifications' : 'Enable notifications'}
                  className={`flex items-center gap-1.5 py-1 px-2.5 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all cursor-pointer ${
                    adminPush.isSubscribed
                      ? 'bg-brand-black text-white border-brand-black'
                      : 'text-brand-gray-600 border-brand-gray-200 hover:border-brand-black hover:text-brand-black'
                  }`}
                >
                  {adminPush.isSubscribed ? (
                    <>
                      <Bell size={11} className="text-amber-300" /> <span>On</span>
                    </>
                  ) : (
                    <>
                      <BellOff size={11} /> <span>Off</span>
                    </>
                  )}
                </button>
              </div>
              {adminPush.isSubscribed && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={adminPush.soundPreference}
                      onChange={e => adminPush.updateSound(e.target.value)}
                      className="flex-1 text-[11px] font-medium border border-brand-gray-200 bg-white py-1 px-2 rounded-lg focus:outline-none focus:border-brand-black cursor-pointer"
                    >
                      <option value="default">Default Alert</option>
                      <option value="chime">Chime</option>
                      <option value="bell">Bell</option>
                      <option value="ding">Ding</option>
                      <option value="silent">Silent</option>
                    </select>
                    <button
                      type="button"
                      disabled={adminPush.soundPreference === 'silent'}
                      onClick={() => playNotificationSound(adminPush.soundPreference)}
                      title="Test sound"
                      className="py-1 px-2 text-[10px] font-bold uppercase tracking-wider bg-white border border-brand-gray-200 hover:border-brand-black hover:text-brand-black text-brand-gray-600 rounded-lg flex items-center gap-1 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      <Volume2 size={11} />
                      <span>Test</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Links */}
          <button
            type="button"
            onClick={onBackToSalon}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-brand-gray-500 hover:text-brand-black hover:bg-brand-gray-100/60 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Customer View</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Header & Responsive Tab Strip (<1024px) ── */}
      <div className="lg:hidden bg-white border-b border-brand-gray-100 sticky top-0 z-30 shadow-xs">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg overflow-hidden border border-brand-gray-200 shrink-0">
              <img
                src={tenant?.branding?.logoUrl || '/logo-bg.jpg'}
                alt={tenant?.name || 'Salon Logo'}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="font-serif font-black text-xs text-brand-black truncate">
                {tenant?.name || 'Salon'}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
                Admin Console
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                title="Search Bookings"
                className="p-2 text-brand-gray-600 hover:text-brand-black text-xs font-bold flex items-center gap-1 rounded-lg hover:bg-brand-gray-50 cursor-pointer"
              >
                <Search size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onBackToSalon}
              title="Customer View"
              className="p-2 text-brand-gray-500 hover:text-brand-black text-xs font-bold flex items-center gap-1 rounded-lg hover:bg-brand-gray-50"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              onClick={onSignOut}
              title="Sign Out"
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg text-xs"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable Horizontal Tab Bar showing ALL tabs directly */}
        <div className="flex items-center px-2 py-1.5 overflow-x-auto scrollbar-hide gap-1 border-t border-brand-gray-100 bg-brand-gray-50/50">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap shrink-0 transition-all ${
                  isActive
                    ? 'bg-brand-black text-white shadow-xs'
                    : 'text-brand-gray-600 hover:text-brand-black bg-white border border-brand-gray-200'
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white text-brand-black' : 'bg-red-50 text-red-600 border border-red-200'
                    }`}
                  >
                    {tab.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <main className="flex-1 lg:pl-60 overflow-y-auto scrollbar-hide">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 lg:px-10 py-6 sm:py-8 lg:py-10 space-y-8 sm:space-y-10">
          {/* ── Push Notification Banner ── */}
          <AnimatePresence>
            {showPushBanner && (
              <motion.div
                key="push-banner"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-start sm:items-center justify-between gap-4 bg-brand-black text-white px-5 py-4 rounded-xl shadow-md"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0" aria-hidden="true">
                    🔔
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-white">
                      Enable Booking Alerts
                    </p>
                    <p className="text-xs text-white/70 mt-0.5 leading-snug">
                      Receive instant audio and push alerts for new appointments, cancellations, and reschedules.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onEnablePushFromBanner}
                    disabled={adminPush.isLoading}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-brand-black text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-brand-gray-100 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {adminPush.isLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Bell size={12} />
                    )}
                    <span>Enable</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDismissPushBanner}
                    className="p-2 text-white/60 hover:text-white transition-colors cursor-pointer"
                    title="Dismiss"
                    aria-label="Dismiss notification prompt"
                  >
                    <X size={15} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {children}
        </div>
      </main>
    </div>
  );
}
