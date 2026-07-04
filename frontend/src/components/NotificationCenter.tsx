import React, { useState, useRef, useEffect } from 'react';
import { Bell, Trash2, CheckCheck, X, Volume2 } from 'lucide-react';
import { useInAppNotifications } from '../hooks/useInAppNotifications';

interface NotificationCenterProps {
  onNavigate?: (url: string) => void;
}

export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useInAppNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="View Notifications"
        className={`relative p-3 rounded-full transition-all duration-500 border ${
          isOpen
            ? 'bg-brand-black text-white border-brand-black'
            : 'bg-brand-gray-50 text-brand-black border-transparent hover:border-brand-black'
        }`}
      >
        <Bell size={18} className={unreadCount > 0 ? 'animate-swing' : ''} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-5 h-5 bg-brand-black text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-brand-white shadow-sm">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-brand-white border border-brand-gray-100 rounded-[12px] shadow-luxury z-50 flex flex-col overflow-hidden max-h-[480px]">
          {/* Header */}
          <div className="p-4 border-b border-brand-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-serif italic font-black text-lg text-brand-black leading-none">
                Notifications
              </h3>
              <p className="text-[10px] font-black uppercase tracking-wider text-brand-gray-400 mt-1">
                {unreadCount} UNREAD
              </p>
            </div>
            {notifications.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={markAllAsRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-brand-gray-400 hover:text-brand-black transition-colors"
                >
                  <CheckCheck size={12} />
                  <span>Read All</span>
                </button>
                <button
                  onClick={clearAll}
                  title="Clear all notifications"
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 size={12} />
                  <span>Clear</span>
                </button>
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-brand-gray-100/50 scrollbar-hide max-h-[350px]">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-brand-gray-50 flex items-center justify-center text-brand-gray-300 mb-3">
                  <Bell size={20} />
                </div>
                <p className="font-serif italic text-sm text-brand-gray-400">
                  No notifications yet
                </p>
                <p className="text-[11px] text-brand-gray-400/80 mt-1 max-w-[200px] leading-relaxed">
                  We'll let you know here when your appointment status updates.
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => {
                    markAsRead(notification.id);
                    if (onNavigate && notification.url) {
                      onNavigate(notification.url);
                    }
                    setIsOpen(false);
                  }}
                  className={`p-4 flex gap-3 transition-colors duration-300 cursor-pointer relative group ${
                    notification.read ? 'bg-transparent' : 'bg-brand-gray-50/40 hover:bg-brand-gray-50/70'
                  }`}
                >
                  {/* Status Indicator */}
                  {!notification.read && (
                    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-brand-black rounded-full" />
                  )}

                  {/* Icon */}
                  <div className="shrink-0 w-9 h-9 rounded-full bg-brand-gray-50 flex items-center justify-center text-brand-gray-600 border border-brand-gray-100">
                    <Volume2 size={14} className={notification.read ? 'opacity-40' : 'opacity-100'} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-6">
                    <p className={`text-xs sm:text-sm font-black leading-tight text-brand-black ${
                      notification.read ? 'font-medium opacity-70' : 'font-black'
                    }`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-brand-gray-500 mt-1 leading-relaxed break-words">
                      {notification.body}
                    </p>
                    <span className="text-[10px] text-brand-gray-400 block mt-1.5">
                      {formatTime(notification.timestamp)}
                    </span>
                  </div>

                  {/* Actions (Delete single) */}
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      className="p-1 rounded-md text-brand-gray-400 hover:text-red-500 hover:bg-brand-gray-100 transition-all"
                      title="Delete notification"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
