import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Bell, 
  Trash2, 
  CheckCheck, 
  CheckCircle2, 
  Clock, 
  CalendarClock, 
  XCircle, 
  Sparkles, 
  RefreshCw, 
  X, 
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { useInAppNotifications } from '../hooks/useInAppNotifications';

interface NotificationCenterProps {
  onNavigate?: (url: string) => void;
  onOpenDedicated?: () => void;
  token?: string;
  ownerPin?: string;
}

/** Helper to clean leading emojis and determine notification category & luxury styling */
function getNotificationMeta(rawTitle: string, body: string) {
  const cleanTitle = (rawTitle || '')
    .replace(/^[\p{Emoji}\u200d\uFE0F\s]+/gu, '')
    .trim() || rawTitle;

  const combined = `${cleanTitle} ${body}`.toLowerCase();

  if (combined.includes('confirm') || combined.includes('approved')) {
    return {
      title: cleanTitle,
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      badgeText: 'Confirmed',
      badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }

  if (combined.includes('reschedule') || combined.includes('slot') || combined.includes('time change')) {
    return {
      title: cleanTitle,
      icon: CalendarClock,
      iconBg: 'bg-rose-50 text-[#C4466F] border-rose-200/80',
      badgeText: 'Rescheduled',
      badgeBg: 'bg-rose-50 text-[#C4466F] border-rose-200',
    };
  }

  if (combined.includes('cancel') || combined.includes('decline')) {
    return {
      title: cleanTitle,
      icon: XCircle,
      iconBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
      badgeText: 'Cancelled',
      badgeBg: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }

  if (combined.includes('request') || combined.includes('pending') || combined.includes('received')) {
    return {
      title: cleanTitle,
      icon: Clock,
      iconBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
      badgeText: 'Pending',
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }

  return {
    title: cleanTitle,
    icon: Sparkles,
    iconBg: 'bg-[#C4466F]/10 text-[#C4466F] border-[#C4466F]/20',
    badgeText: 'Salon Update',
    badgeBg: 'bg-[#FAF8F5] text-[#231F1D] border-[rgba(240,213,222,0.8)]',
  };
}

/** Humanizes raw ISO dates (YYYY-MM-DD) and 24h times inside notification text */
function humanizeNotificationBody(body: string): string {
  if (!body) return '';

  // Clean leading emojis that may have been baked into body
  let text = body.replace(/^[\p{Emoji}\u200d\uFE0F\s]+/gu, '').trim();

  // Replace YYYY-MM-DD with friendly date like "Fri, 30 Oct"
  text = text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, y, m, d) => {
    try {
      const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      }
    } catch {
      // ignore
    }
    return match;
  });

  // Replace 24h time like "14:30" with "2:30 PM"
  text = text.replace(/\b(\d{2}):(\d{2})\b/g, (match, hh, mm) => {
    const h = parseInt(hh, 10);
    if (h >= 0 && h <= 23) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${mm} ${period}`;
    }
    return match;
  });

  return text;
}

export function NotificationCenter({ onNavigate, onOpenDedicated, token, ownerPin }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useInAppNotifications({ token, ownerPin });

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside for desktop view
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Only close if not clicking within a portaled modal (which handles its own overlay click)
        const targetEl = event.target as Element;
        if (!targetEl.closest?.('[data-notification-portal="true"]')) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lock body scroll on mobile when modal is open
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined' && window.innerWidth < 640) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  const formatTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Group notifications into Today vs Earlier
  const grouped = notifications.reduce(
    (acc, item) => {
      const isToday = new Date(item.timestamp).toDateString() === new Date().toDateString();
      const groupKey = isToday ? 'Today' : 'Earlier';
      acc[groupKey].push(item);
      return acc;
    },
    { Today: [], Earlier: [] } as Record<'Today' | 'Earlier', typeof notifications>
  );

  /** Shared content for dropdown/modal */
  const renderContent = (isMobile = false) => (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`bg-[#FAF8F5] border border-[rgba(240,213,222,0.85)] shadow-luxury flex flex-col overflow-hidden ${
        isMobile
          ? 'w-full max-w-md max-h-[85vh] rounded-2xl animate-in fade-in zoom-in-95 duration-200'
          : 'w-96 rounded-2xl max-h-[520px]'
      }`}
    >
      {/* Header */}
      <div className="p-4 sm:p-4.5 bg-white/90 backdrop-blur-sm border-b border-[rgba(240,213,222,0.7)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#C4466F]/10 text-[#C4466F] flex items-center justify-center">
            <Bell size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif italic font-bold text-lg text-[#231F1D] leading-none">
                Notifications
              </h3>
              {isLoading && (
                <RefreshCw size={12} className="animate-spin text-[#6E655F]" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                unreadCount > 0
                  ? 'bg-[#C4466F]/10 text-[#C4466F] border-[#C4466F]/20'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {unreadCount > 0 ? `${unreadCount} Unread` : 'All Caught Up'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <div className="flex items-center gap-2 sm:gap-2.5 mr-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-[#6E655F] hover:text-[#231F1D] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
                >
                  <CheckCheck size={13} />
                  <span>Read All</span>
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                title="Clear all notifications"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-full text-[#6E655F] hover:text-[#231F1D] hover:bg-black/5 transition-colors cursor-pointer"
            aria-label="Close notifications"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-[rgba(240,213,222,0.4)] scrollbar-thin">
        {notifications.length === 0 ? (
          <div className="py-14 px-6 text-center flex flex-col items-center justify-center">
            {isLoading ? (
              <div className="w-12 h-12 rounded-full bg-white/80 border border-[rgba(240,213,222,0.8)] flex items-center justify-center mb-3 shadow-xs">
                <RefreshCw size={20} className="animate-spin text-[#C4466F]" />
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-[#C4466F]/10 border border-[#C4466F]/20 flex items-center justify-center text-[#C4466F] mb-3 shadow-xs">
                  <Bell size={22} />
                </div>
                <p className="font-serif italic font-bold text-base text-[#231F1D]">
                  No notifications right now
                </p>
                <p className="text-xs text-[#6E655F] mt-1.5 max-w-[220px] leading-relaxed">
                  We'll update you here with confirmation passes and stylist alerts.
                </p>
              </>
            )}
          </div>
        ) : (
          (['Today', 'Earlier'] as const).map((groupKey) => {
            const groupItems = grouped[groupKey];
            if (groupItems.length === 0) return null;

            return (
              <div key={groupKey} className="flex flex-col">
                {/* Group Title Section */}
                <div className="bg-[#FAF8F5]/90 px-4 py-2 border-y border-[rgba(240,213,222,0.5)] flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#6E655F]">
                    {groupKey}
                  </span>
                  <span className="text-[10px] text-[#6E655F]/70 font-semibold">
                    {groupItems.length} {groupItems.length === 1 ? 'alert' : 'alerts'}
                  </span>
                </div>

                {/* Group Items */}
                <div className="divide-y divide-[rgba(240,213,222,0.3)]">
                  {groupItems.map((notification) => {
                    const meta = getNotificationMeta(notification.title, notification.body);
                    const IconComponent = meta.icon;
                    const humanBody = humanizeNotificationBody(notification.body);

                    return (
                      <div
                        key={notification.id}
                        onClick={() => {
                          markAsRead(notification.id);
                          if (onNavigate && notification.url) {
                            onNavigate(notification.url);
                          }
                          setIsOpen(false);
                        }}
                        className={`p-4 flex gap-3.5 transition-colors duration-200 cursor-pointer relative group ${
                          notification.read
                            ? 'bg-transparent hover:bg-white/60'
                            : 'bg-white/80 hover:bg-white shadow-xs'
                        }`}
                      >
                        {/* Unread Indicator Bar */}
                        {!notification.read && (
                          <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#C4466F] rounded-r-full" />
                        )}

                        {/* Category Icon */}
                        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs ${meta.iconBg}`}>
                          <IconComponent size={16} strokeWidth={2.2} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${meta.badgeBg}`}>
                              {meta.badgeText}
                            </span>
                            <span className="text-[11px] text-[#6E655F]/80 flex items-center gap-1 ml-auto">
                              <Clock size={10} />
                              {formatTime(notification.timestamp)}
                            </span>
                          </div>

                          <p className={`text-xs sm:text-sm leading-snug text-[#231F1D] ${
                            notification.read ? 'font-medium' : 'font-bold'
                          }`}>
                            {meta.title}
                          </p>

                          <p className="text-xs text-[#6E655F] mt-1 leading-relaxed break-words">
                            {humanBody}
                          </p>
                        </div>

                        {/* Action: Delete single */}
                        <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="p-1.5 rounded-lg text-[#6E655F] hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                            title="Delete notification"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Link to Dedicated Page */}
      {onOpenDedicated && (
        <div className="p-3 bg-white/90 border-t border-[rgba(240,213,222,0.7)] flex items-center justify-between shrink-0">
          <span className="text-[11px] font-medium text-[#6E655F]">
            Flo Sisterlocks Activity
          </span>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenDedicated();
            }}
            className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#C4466F] hover:text-[#A83257] transition-colors cursor-pointer"
          >
            <span>View Full Hub</span>
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="View Notifications"
        aria-label="View Notifications"
        className={`relative p-3 rounded-full transition-all duration-300 border cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
          isOpen
            ? 'bg-[#231F1D] text-white border-[#231F1D] shadow-sm'
            : 'bg-[#FAF8F5] text-[#231F1D] border-[rgba(240,213,222,0.85)] hover:border-[#231F1D] hover:bg-white shadow-2xs'
        }`}
      >
        <Bell size={18} className={unreadCount > 0 ? 'animate-bounce duration-1000' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-[#C4466F] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#FAF8F5] shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Desktop Dropdown: Anchored directly below the bell in standard flow */}
      {isOpen && (
        <div className="hidden sm:block absolute right-0 top-full mt-3 z-50 animate-in fade-in zoom-in-95 duration-150">
          {renderContent(false)}
        </div>
      )}

      {/* Mobile Modal: Rendered via Portal directly into document.body to prevent any header clipping */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          data-notification-portal="true"
          className="sm:hidden fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#231F1D]/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          {renderContent(true)}
        </div>,
        document.body
      )}
    </div>
  );
}
