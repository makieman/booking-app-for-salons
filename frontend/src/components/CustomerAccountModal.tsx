import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Calendar,
  Clock,
  Phone,
  Mail,
  Check,
  Copy,
  X,
  Search,
  Trash2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Booking, Service, Attendant } from '../types';
import * as api from '../api/client';

interface CustomerAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientInfo: { name: string; phone: string; email: string };
  onUpdateClientInfo: (info: { name: string; phone: string; email: string }) => void;
  onViewBookingDetails: (reference: string) => void;
  onRescheduleBooking?: (booking: Booking) => void;
  formatPrice?: (price: number, priceMax?: number) => string;
}

function defaultFormatPrice(price: number, priceMax?: number): string {
  if (priceMax && priceMax > price) {
    return `KES ${price.toLocaleString()} – ${priceMax.toLocaleString()}`;
  }
  return `KES ${price.toLocaleString()}`;
}

export function CustomerAccountModal({
  isOpen,
  onClose,
  clientInfo,
  onUpdateClientInfo,
  onViewBookingDetails,
  onRescheduleBooking,
  formatPrice = defaultFormatPrice,
}: CustomerAccountModalProps) {
  const [activeTab, setActiveTab] = useState<'bookings' | 'profile'>('bookings');

  // Profile form state
  const [profileName, setProfileName] = useState(clientInfo.name || '');
  const [profilePhone, setProfilePhone] = useState(clientInfo.phone || '');
  const [profileEmail, setProfileEmail] = useState(clientInfo.email || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Bookings state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Lookup / link booking in account
  const [manualLookupQuery, setManualLookupQuery] = useState('');
  const [linkingBooking, setLinkingBooking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cancellation state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Sync profile fields when clientInfo updates or modal opens
  useEffect(() => {
    if (isOpen) {
      setProfileName(clientInfo.name || '');
      setProfilePhone(clientInfo.phone || '');
      setProfileEmail(clientInfo.email || '');
      setSaveSuccess(false);
      setLinkMessage(null);
    }
  }, [isOpen, clientInfo]);

  // Load bookings for current customer
  const loadCustomerBookings = useCallback(async () => {
    setLoadingBookings(true);
    setBookingError(null);

    try {
      const fetchedBookings: Booking[] = [];
      const seenIds = new Set<string>();

      // 1. Gather all stored references
      const storedRefs: string[] = [];
      try {
        const refsRaw = localStorage.getItem('customerBookingRefs');
        if (refsRaw) {
          const parsed = JSON.parse(refsRaw);
          if (Array.isArray(parsed)) storedRefs.push(...parsed);
        }
        const lastRef = localStorage.getItem('lastBookingReference');
        if (lastRef && !storedRefs.includes(lastRef)) {
          storedRefs.unshift(lastRef);
        }
      } catch (err) {
        console.error('Error reading saved booking references:', err);
      }

      // Query by references
      for (const ref of storedRefs.slice(0, 10)) {
        try {
          const results = await api.lookupBookings({ reference: ref });
          for (const b of results) {
            if (!seenIds.has(b._id)) {
              seenIds.add(b._id);
              fetchedBookings.push(b);
            }
          }
        } catch {}
      }

      // 2. Also query by phone if available to catch any cross-device bookings
      const phoneToSearch = clientInfo.phone?.trim() || profilePhone.trim();
      if (phoneToSearch) {
        try {
          const phoneResults = await api.lookupBookings({ phone: phoneToSearch });
          for (const b of phoneResults) {
            if (!seenIds.has(b._id)) {
              seenIds.add(b._id);
              fetchedBookings.push(b);
            }
            // Auto-link new references to stored refs
            if (b.reference && !storedRefs.includes(b.reference)) {
              storedRefs.push(b.reference);
            }
          }
          try {
            localStorage.setItem('customerBookingRefs', JSON.stringify(storedRefs));
          } catch {}
        } catch {}
      }

      // Sort newest first
      fetchedBookings.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime || '00:00'}`).getTime();
        const dateB = new Date(`${b.date}T${b.startTime || '00:00'}`).getTime();
        return dateB - dateA;
      });

      setBookings(fetchedBookings);
    } catch (err: any) {
      setBookingError('Unable to load some appointments. Please check your network connection.');
    } finally {
      setLoadingBookings(false);
    }
  }, [clientInfo.phone, profilePhone]);

  // Fetch bookings whenever modal opens
  useEffect(() => {
    if (isOpen) {
      loadCustomerBookings();
    }
  }, [isOpen, loadCustomerBookings]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Save profile handler
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      name: profileName.trim(),
      phone: profilePhone.trim(),
      email: profileEmail.trim(),
    };

    try {
      localStorage.setItem('customerProfile', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save customerProfile:', err);
    }

    onUpdateClientInfo(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Clear profile from device
  const handleClearProfile = () => {
    if (window.confirm('Clear your saved contact details from this browser?')) {
      try {
        localStorage.removeItem('customerProfile');
      } catch {}
      setProfileName('');
      setProfilePhone('');
      setProfileEmail('');
      onUpdateClientInfo({ name: '', phone: '', email: '' });
      setSaveSuccess(false);
    }
  };

  // Copy reference feedback
  const handleCopyRef = (ref: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  // Manual lookup & link to account
  const handleLinkBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = manualLookupQuery.trim();
    if (!query) return;

    setLinkingBooking(true);
    setLinkMessage(null);

    try {
      const isRef = query.toUpperCase().startsWith('LMN-') || query.length >= 7;
      const results = isRef
        ? await api.lookupBookings({ reference: query })
        : await api.lookupBookings({ phone: query });

      if (!results || results.length === 0) {
        setLinkMessage({
          type: 'error',
          text: `No appointments found matching "${query}". Please check the spelling or reference.`,
        });
      } else {
        // Append newly discovered bookings
        setBookings(prev => {
          const map = new Map<string, Booking>(prev.map(b => [b._id, b]));
          for (const b of results) {
            map.set(b._id, b);
          }
          const merged: Booking[] = Array.from(map.values());
          merged.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.startTime || '00:00'}`).getTime();
            const dateB = new Date(`${b.date}T${b.startTime || '00:00'}`).getTime();
            return dateB - dateA;
          });
          return merged;
        });

        // Store references in localStorage
        try {
          const raw = localStorage.getItem('customerBookingRefs');
          const current: string[] = raw ? JSON.parse(raw) : [];
          for (const b of results) {
            if (b.reference && !current.includes(b.reference)) {
              current.unshift(b.reference);
            }
          }
          localStorage.setItem('customerBookingRefs', JSON.stringify(current));
        } catch {}

        setLinkMessage({
          type: 'success',
          text: `Found and linked ${results.length} appointment${results.length > 1 ? 's' : ''}!`,
        });
        setManualLookupQuery('');
      }
    } catch (err: any) {
      setLinkMessage({
        type: 'error',
        text: err.message || 'Error looking up appointment.',
      });
    } finally {
      setLinkingBooking(false);
    }
  };

  // Cancel booking handler
  const handleCancelBooking = async (bookingId: string, reference?: string) => {
    const confirmMessage = reference
      ? `Are you sure you want to cancel appointment #${reference}? This cannot be undone.`
      : 'Are you sure you want to cancel this appointment?';

    if (!window.confirm(confirmMessage)) return;

    setCancellingId(bookingId);
    try {
      const updated = await api.cancelBookingCustomer(bookingId);
      setBookings(prev =>
        prev.map(b => (b._id === bookingId ? { ...b, status: 'cancelled' } : b))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment. Please contact the salon directly.');
    } finally {
      setCancellingId(null);
    }
  };

  // Helper for status badge
  const renderStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Confirmed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-zinc-100 text-zinc-700 border border-zinc-200">
            <Check size={11} className="text-zinc-600" />
            Completed
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending Approval
          </span>
        );
    }
  };

  // User initials avatar
  const getInitials = (name: string) => {
    if (!name.trim()) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(profileName || clientInfo.name);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-account-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in font-sans"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl bg-brand-white border border-brand-gray-200 shadow-2xl rounded-xl flex flex-col max-h-[90vh] overflow-hidden font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-brand-gray-200 bg-brand-white">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-brand-black text-white flex items-center justify-center font-bold text-xs tracking-wider shrink-0">
              {initials ? initials : <User size={18} />}
            </div>
            <div>
              <h2
                id="customer-account-title"
                className="text-base sm:text-lg font-bold text-brand-black tracking-tight"
              >
                {profileName.trim() ? profileName : 'My Account'}
              </h2>
              <p className="text-xs text-brand-gray-500 font-normal">
                {profilePhone || profileEmail || 'Guest Client Profile'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Account Modal"
            className="p-2 rounded-lg text-brand-gray-500 hover:text-brand-black hover:bg-brand-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-brand-gray-200 bg-brand-white px-6">
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className={`py-3.5 px-4 text-xs font-semibold tracking-wider transition-all flex items-center gap-2 border-b-2 -mb-px ${
              activeTab === 'bookings'
                ? 'border-brand-black text-brand-black font-bold'
                : 'border-transparent text-brand-gray-500 hover:text-brand-black'
            }`}
          >
            <Calendar size={14} />
            <span>My Bookings</span>
            {bookings.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-brand-black text-white font-medium">
                {bookings.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-3.5 px-4 text-xs font-semibold tracking-wider transition-all flex items-center gap-2 border-b-2 -mb-px ${
              activeTab === 'profile'
                ? 'border-brand-black text-brand-black font-bold'
                : 'border-transparent text-brand-gray-500 hover:text-brand-black'
            }`}
          >
            <User size={14} />
            <span>My Profile</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              {/* Header Actions: Refresh & Manual Link */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-brand-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray-500">
                    Appointments History
                  </span>
                  <button
                    type="button"
                    onClick={loadCustomerBookings}
                    disabled={loadingBookings}
                    title="Refresh appointments"
                    className="p-1.5 rounded-full hover:bg-brand-gray-100 text-brand-gray-500 hover:text-brand-black transition-colors"
                  >
                    <RefreshCw size={13} className={loadingBookings ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Quick Link by Reference/Phone */}
                <form onSubmit={handleLinkBooking} className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={manualLookupQuery}
                    onChange={e => setManualLookupQuery(e.target.value)}
                    placeholder="Link booking (Ref or Phone)"
                    className="flex-1 sm:w-56 px-3 py-2 text-xs border border-brand-gray-300 rounded-lg focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black placeholder:text-brand-gray-400 font-medium"
                  />
                  <button
                    type="submit"
                    disabled={linkingBooking || !manualLookupQuery.trim()}
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider bg-brand-black text-white rounded-lg hover:bg-brand-gray-800 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {linkingBooking ? 'Linking...' : 'Link'}
                  </button>
                </form>
              </div>

              {/* Feedback Message */}
              {linkMessage && (
                <div
                  className={`p-3.5 rounded-lg text-xs flex items-center justify-between gap-2 border font-medium ${
                    linkMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  <span>{linkMessage.text}</span>
                  <button
                    type="button"
                    onClick={() => setLinkMessage(null)}
                    className="text-inherit opacity-60 hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Error banner */}
              {bookingError && (
                <div className="p-3.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-medium">
                  {bookingError}
                </div>
              )}

              {/* Booking List */}
              {loadingBookings && bookings.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <RefreshCw size={24} className="mx-auto animate-spin text-brand-gray-400" />
                  <p className="text-xs text-brand-gray-500 font-normal">
                    Checking appointment records...
                  </p>
                </div>
              ) : bookings.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-brand-gray-200 rounded-xl p-8 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-brand-gray-100 flex items-center justify-center text-brand-gray-400">
                    <Calendar size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider text-brand-black">
                      No Saved Appointments Yet
                    </h3>
                    <p className="text-xs text-brand-gray-500 font-normal max-w-sm mx-auto mt-1 leading-relaxed">
                      Appointments booked on this device will appear here automatically. You can also link an existing booking using its reference number above.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.map(booking => {
                    const svc = typeof booking.serviceId === 'object' ? booking.serviceId : null;
                    const attendant = typeof booking.attendantId === 'object' ? booking.attendantId : null;

                    return (
                      <div
                        key={booking._id}
                        className="p-4 border border-brand-gray-200 rounded-lg bg-brand-white hover:border-brand-gray-400 transition-colors space-y-3 shadow-xs"
                      >
                        {/* Card Top: Reference + Status */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-brand-gray-100 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs sm:text-sm tracking-wide uppercase text-brand-black">
                              #{booking.reference || 'REF-PENDING'}
                            </span>
                            {booking.reference && (
                              <button
                                type="button"
                                onClick={e => handleCopyRef(booking.reference!, e)}
                                title="Copy Reference"
                                className="p-1 text-brand-gray-400 hover:text-brand-black transition-colors rounded"
                              >
                                {copiedRef === booking.reference ? (
                                  <Check size={13} className="text-emerald-600" />
                                ) : (
                                  <Copy size={13} />
                                )}
                              </button>
                            )}
                          </div>
                          <div>{renderStatusBadge(booking.status)}</div>
                        </div>

                        {/* Card Details Grid */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-gray-500 mb-0.5">
                              Service
                            </span>
                            <span className="font-semibold uppercase text-brand-black">
                              {svc ? svc.name : 'Salon Service'}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-gray-500 mb-0.5">
                              Cost
                            </span>
                            <span className="font-semibold text-brand-black">
                              {svc ? formatPrice(svc.price, svc.priceMax) : 'KES 0'}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-gray-500 mb-0.5">
                              Date & Time
                            </span>
                            <span className="font-semibold text-brand-black">
                              {booking.date} @ {booking.startTime}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-gray-500 mb-0.5">
                              Stylist / Specialist
                            </span>
                            <span className="font-medium text-brand-black">
                              {attendant ? attendant.name : 'Any Available Stylist'}
                            </span>
                          </div>
                        </div>

                        {/* Card Actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-brand-gray-100">
                          {booking.reference && (
                            <button
                              type="button"
                              onClick={() => {
                                onViewBookingDetails(booking.reference!);
                                onClose();
                              }}
                              className="flex-1 min-w-[110px] py-2 px-3 bg-brand-black text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-brand-gray-800 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <span>View Details</span>
                              <ExternalLink size={11} />
                            </button>
                          )}

                          {onRescheduleBooking &&
                            booking.status !== 'cancelled' &&
                            booking.status !== 'completed' && (
                              <button
                                type="button"
                                onClick={() => {
                                  onRescheduleBooking(booking);
                                  onClose();
                                }}
                                className="py-2 px-3 bg-brand-white border border-brand-gray-300 text-brand-black text-[10px] font-semibold uppercase tracking-wider rounded-lg hover:bg-brand-gray-50 transition-colors"
                              >
                                Reschedule
                              </button>
                            )}

                          {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                            <button
                              type="button"
                              disabled={cancellingId === booking._id}
                              onClick={() => handleCancelBooking(booking._id, booking.reference)}
                              className="py-2 px-3 border border-rose-200 text-rose-600 hover:bg-rose-50 text-[10px] font-semibold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50"
                            >
                              {cancellingId === booking._id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-6">
              {saveSuccess && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <Check size={15} className="text-emerald-600 shrink-0" />
                  <span>Profile updated successfully! Your information is ready for your next booking.</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray-500 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-brand-white border border-brand-gray-300 rounded-lg text-xs sm:text-sm font-medium text-brand-black tracking-normal focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray-500 mb-1.5">
                    Phone Number (WhatsApp & SMS)
                  </label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                    <input
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={e => setProfilePhone(e.target.value)}
                      placeholder="e.g. 0712345678"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-brand-white border border-brand-gray-300 rounded-lg text-xs sm:text-sm font-medium text-brand-black tracking-normal focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-colors"
                    />
                  </div>
                  <p className="text-xs text-brand-gray-500 font-normal mt-1">
                    Used for booking status notifications and reminders.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gray-500 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                    <input
                      type="email"
                      required
                      value={profileEmail}
                      onChange={e => setProfileEmail(e.target.value)}
                      placeholder="e.g. jane@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-brand-white border border-brand-gray-300 rounded-lg text-xs sm:text-sm font-medium text-brand-black tracking-normal focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-colors"
                    />
                  </div>
                  <p className="text-xs text-brand-gray-500 font-normal mt-1">
                    Booking receipts and calendar invitations are sent here.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="submit"
                    className="w-full sm:flex-1 py-3 bg-brand-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-brand-gray-800 transition-colors shadow-sm"
                  >
                    Save Changes
                  </button>

                  <button
                    type="button"
                    onClick={handleClearProfile}
                    className="w-full sm:w-auto py-3 px-4 text-xs font-semibold tracking-wider text-brand-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={14} />
                    <span>Clear Saved Data</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-brand-gray-200 bg-brand-white flex items-center justify-between text-xs text-brand-gray-500 font-normal">
          <span>Flo Sisterlocks • Client Concierge</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wider text-brand-black hover:opacity-70 transition-opacity"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
