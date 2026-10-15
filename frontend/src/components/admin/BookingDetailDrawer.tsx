import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Phone,
  MessageSquare,
  RotateCcw,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Booking, Service, Attendant, BookingStatus } from '../../types';
import { formatPrice } from '../../utils/formatters';
import { formatDisplayDate } from '../../utils/dateUtils';
import { AdminUpdateBookingPayload } from '../../api/client';

interface BookingDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  groupBookings?: Booking[];
  attendants: Attendant[];
  services: Service[];
  onUpdateBooking: (bookingId: string, payload: AdminUpdateBookingPayload) => Promise<void>;
  loading?: boolean;
}

export function BookingDetailDrawer({
  isOpen,
  onClose,
  booking,
  groupBookings = [],
  attendants,
  services,
  onUpdateBooking,
  loading = false,
}: BookingDetailDrawerProps) {
  // Reschedule form state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleAttendantId, setRescheduleAttendantId] = useState<string>('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Cancellation form state
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  // Notes state
  const [notes, setNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);

  // Direct action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Reset forms when selected booking changes
  useEffect(() => {
    if (booking) {
      setRescheduleDate(booking.date);
      setRescheduleTime(booking.startTime);
      const attId =
        booking.attendantId && typeof booking.attendantId === 'object'
          ? (booking.attendantId as Attendant)._id
          : (booking.attendantId as string) || '';
      setRescheduleAttendantId(attId);
      setNotes(booking.notes || '');
      setIsRescheduling(false);
      setIsCancelling(false);
      setIsEditingNotes(false);
      setRescheduleError(null);
      setCancellationReason('');
    }
  }, [booking]);

  if (!booking) return null;

  // Multi-service segments calculation
  const segments = groupBookings.length > 0 ? groupBookings : [booking];
  const totalAmount = segments.reduce((sum, b) => {
    if (b.price) return sum + b.price;
    const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
    return sum + (svc?.price || 0);
  }, 0);

  const primaryService = typeof booking.serviceId === 'object' ? (booking.serviceId as Service) : null;
  const attendantObj =
    booking.attendantId && typeof booking.attendantId === 'object'
      ? (booking.attendantId as Attendant)
      : null;
  const attendantName = attendantObj ? attendantObj.name : 'Unassigned';

  // Normalize phone for WhatsApp link
  const normalizedPhone = booking.phone.replace(/[\s+-]/g, '');
  const waPhone = normalizedPhone.startsWith('0')
    ? `254${normalizedPhone.slice(1)}`
    : normalizedPhone.startsWith('254')
    ? normalizedPhone
    : `254${normalizedPhone}`;
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
    `Hi ${booking.customerName}, regarding your appointment at Flo Sisterlocks on ${booking.date} at ${booking.startTime}:`
  )}`;

  // Status badge config
  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'confirmed':
        return {
          label: 'Confirmed',
          className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'pending':
        return {
          label: 'Pending Approval',
          className: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'completed':
        return {
          label: 'Completed',
          className: 'bg-blue-50 text-blue-800 border-blue-200',
        };
      case 'no-show':
        return {
          label: 'No-Show',
          className: 'bg-neutral-100 text-neutral-800 border-neutral-300',
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          className: 'bg-rose-50 text-rose-800 border-rose-200',
        };
      default:
        return {
          label: status,
          className: 'bg-neutral-100 text-neutral-700 border-neutral-200',
        };
    }
  };

  const statusBadge = getStatusBadge(booking.status);

  // Handle Save Reschedule
  const handleSaveReschedule = async () => {
    if (!rescheduleDate || !rescheduleTime) {
      setRescheduleError('Please select both date and time.');
      return;
    }
    setRescheduleLoading(true);
    setRescheduleError(null);
    try {
      await onUpdateBooking(booking._id, {
        reschedule: {
          date: rescheduleDate,
          startTime: rescheduleTime,
          attendantId: rescheduleAttendantId || undefined,
        },
      });
      setIsRescheduling(false);
    } catch (err: any) {
      setRescheduleError(err.message || 'Failed to reschedule. The slot may conflict with an existing appointment.');
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Handle Confirm Cancellation
  const handleConfirmCancel = async () => {
    setCancelLoading(true);
    try {
      await onUpdateBooking(booking._id, {
        status: 'cancelled',
        cancellationReason: cancellationReason.trim() || undefined,
      });
      setIsCancelling(false);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
    } finally {
      setCancelLoading(false);
    }
  };

  // Handle Status Change
  const handleQuickStatusChange = async (targetStatus: BookingStatus) => {
    setActionLoading(targetStatus);
    try {
      await onUpdateBooking(booking._id, { status: targetStatus });
    } catch (err: any) {
      alert(err.message || `Failed to update to ${targetStatus}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Notes Save
  const handleSaveNotes = async () => {
    setNotesLoading(true);
    try {
      await onUpdateBooking(booking._id, { notes: notes.trim() });
      setIsEditingNotes(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save notes');
    } finally {
      setNotesLoading(false);
    }
  };

  // Standard time slots for quick selection
  const standardTimeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-brand-black/40 backdrop-blur-xs z-50"
          />

          {/* Drawer Container */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-y-0 right-0 w-full sm:max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-brand-gray-100 flex items-center justify-between bg-brand-gray-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-brand-black text-white rounded-xl flex items-center justify-center font-bold text-sm shadow-xs">
                  {booking.customerName
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h3 className="font-serif font-black text-lg text-brand-black leading-tight">
                    {booking.customerName}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {booking.reference && (
                      <span className="text-[11px] font-mono font-bold text-brand-gray-500">
                        #{booking.reference}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${statusBadge.className}`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-brand-gray-400 hover:text-brand-black hover:bg-brand-gray-100 rounded-lg transition-colors"
                title="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {/* Quick Communication Bar */}
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`tel:${booking.phone}`}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-brand-gray-200 bg-white hover:border-brand-black text-xs font-bold text-brand-black transition-all shadow-xs"
                >
                  <Phone size={14} className="text-brand-gray-500" />
                  <span>Call {booking.phone}</span>
                </a>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 transition-all shadow-xs"
                >
                  <MessageSquare size={14} className="text-emerald-600" />
                  <span>WhatsApp Chat</span>
                </a>
              </div>

              {/* Appointment Schedule Details */}
              <div className="p-4 bg-brand-gray-50/70 border border-brand-gray-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
                    Appointment Schedule
                  </h4>
                  {booking.status !== 'cancelled' && !isRescheduling && (
                    <button
                      onClick={() => setIsRescheduling(true)}
                      className="text-xs font-bold text-brand-black hover:underline flex items-center gap-1"
                    >
                      <RotateCcw size={12} />
                      <span>Reschedule</span>
                    </button>
                  )}
                </div>

                {!isRescheduling ? (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-brand-gray-400 block tracking-wider">
                        Date
                      </span>
                      <p className="font-bold text-brand-black text-sm mt-0.5">
                        {formatDisplayDate(booking.date, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-brand-gray-400 block tracking-wider">
                        Time Window
                      </span>
                      <p className="font-mono font-bold text-brand-black text-sm mt-0.5">
                        {booking.startTime} – {booking.endTime}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-brand-gray-400 block tracking-wider">
                        Assigned Stylist
                      </span>
                      <p className="font-semibold text-brand-gray-800 text-sm mt-0.5">
                        {attendantName}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-brand-gray-400 block tracking-wider">
                        Total Price
                      </span>
                      <p className="font-mono font-bold text-brand-black text-sm mt-0.5">
                        {formatPrice(totalAmount)}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Inline Reschedule Form */
                  <div className="space-y-4 pt-2">
                    {rescheduleError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
                        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                        <span>{rescheduleError}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                        New Date
                      </label>
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={e => setRescheduleDate(e.target.value)}
                        className="w-full bg-white border border-brand-gray-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-brand-black focus:outline-none focus:border-brand-black"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                        New Start Time
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={e => setRescheduleTime(e.target.value)}
                          className="w-1/2 bg-white border border-brand-gray-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-brand-black focus:outline-none focus:border-brand-black"
                        />
                        <select
                          value={rescheduleTime}
                          onChange={e => setRescheduleTime(e.target.value)}
                          className="w-1/2 bg-white border border-brand-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-brand-black focus:outline-none focus:border-brand-black"
                        >
                          <option value="">Quick slot...</option>
                          {standardTimeSlots.map(t => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                        Stylist
                      </label>
                      <select
                        value={rescheduleAttendantId}
                        onChange={e => setRescheduleAttendantId(e.target.value)}
                        className="w-full bg-white border border-brand-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-brand-black focus:outline-none focus:border-brand-black"
                      >
                        <option value="">Keep current / Any</option>
                        {attendants.map(att => (
                          <option key={att._id} value={att._id}>
                            {att.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-gray-200">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRescheduling(false);
                          setRescheduleError(null);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-brand-gray-600 hover:text-brand-black rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveReschedule}
                        disabled={rescheduleLoading}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-black text-white text-xs font-bold rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-xs"
                      >
                        {rescheduleLoading && <Loader2 size={12} className="animate-spin" />}
                        <span>Confirm Reschedule</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Service or Single Service Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
                    Service Breakdown ({segments.length})
                  </h4>
                  <span className="text-xs font-mono font-bold text-brand-black">
                    {formatPrice(totalAmount)}
                  </span>
                </div>

                <div className="divide-y divide-brand-gray-100 border border-brand-gray-200 rounded-xl overflow-hidden bg-white">
                  {segments.map((seg, idx) => {
                    const svc = typeof seg.serviceId === 'object' ? (seg.serviceId as Service) : null;
                    const att =
                      seg.attendantId && typeof seg.attendantId === 'object'
                        ? (seg.attendantId as Attendant)
                        : null;
                    const price = seg.price || svc?.price || 0;

                    return (
                      <div key={seg._id} className="p-3.5 flex items-center justify-between text-xs">
                        <div className="flex items-start gap-3">
                          <span className="w-5 h-5 bg-brand-gray-100 text-brand-gray-700 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-bold text-brand-black">{svc ? svc.name : 'Custom Service'}</p>
                            <p className="text-[11px] text-brand-gray-500 mt-0.5">
                              {seg.startTime} – {seg.endTime} • Stylist: {att ? att.name : 'Unassigned'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-brand-black">{formatPrice(price)}</p>
                          {svc?.duration && (
                            <p className="text-[10px] text-brand-gray-400">{svc.duration} mins</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cancellation Reason Notice (if cancelled) */}
              {booking.status === 'cancelled' && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                    <XCircle size={14} className="text-rose-600" />
                    <span>Booking Cancelled</span>
                  </div>
                  <p className="text-xs text-rose-700">
                    {booking.cancellationReason
                      ? `Reason provided: "${booking.cancellationReason}"`
                      : 'No specific cancellation reason was noted.'}
                  </p>
                </div>
              )}

              {/* Completion Notice (if completed) */}
              {booking.status === 'completed' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800">
                    <CheckCircle2 size={14} className="text-blue-600" />
                    <span>Appointment Completed</span>
                  </div>
                  <p className="text-xs text-blue-700">
                    This appointment has been fulfilled and verified.
                  </p>
                </div>
              )}

              {/* Admin Notes Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-gray-500 flex items-center gap-1">
                    <FileText size={13} />
                    <span>Internal Notes</span>
                  </h4>
                  {!isEditingNotes && (
                    <button
                      onClick={() => setIsEditingNotes(true)}
                      className="text-xs font-bold text-brand-black hover:underline"
                    >
                      {booking.notes ? 'Edit Note' : 'Add Note'}
                    </button>
                  )}
                </div>

                {!isEditingNotes ? (
                  <div className="p-3 bg-brand-gray-50 border border-brand-gray-200 rounded-xl text-xs text-brand-gray-700 min-h-[50px]">
                    {booking.notes ? (
                      <p className="whitespace-pre-wrap">{booking.notes}</p>
                    ) : (
                      <p className="text-brand-gray-400 italic">No internal notes for this booking.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="e.g. Client requested quiet session, prefers specific oil..."
                      rows={3}
                      className="w-full bg-white border border-brand-gray-300 rounded-xl p-3 text-xs text-brand-black focus:outline-none focus:border-brand-black"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setIsEditingNotes(false);
                          setNotes(booking.notes || '');
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-brand-gray-600 hover:text-brand-black"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveNotes}
                        disabled={notesLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-black text-white text-xs font-bold rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-xs"
                      >
                        {notesLoading && <Loader2 size={12} className="animate-spin" />}
                        <span>Save Note</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Cancellation Dialog Inline Prompt */}
              {isCancelling && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-rose-800">
                      Cancel Appointment
                    </h5>
                    <button
                      onClick={() => setIsCancelling(false)}
                      className="text-rose-500 hover:text-rose-800 text-xs font-bold"
                    >
                      Dismiss
                    </button>
                  </div>
                  <p className="text-xs text-rose-700">
                    The customer will receive an automated cancellation alert via WhatsApp and Email.
                  </p>
                  <input
                    type="text"
                    value={cancellationReason}
                    onChange={e => setCancellationReason(e.target.value)}
                    placeholder="Optional reason (e.g. Stylist illness, emergency closure)..."
                    className="w-full bg-white border border-rose-300 rounded-lg p-2.5 text-xs text-brand-black placeholder:text-brand-gray-400 focus:outline-none focus:border-rose-600"
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCancelling(false)}
                      className="px-3 py-1.5 text-xs font-bold text-rose-700 hover:text-rose-900"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCancel}
                      disabled={cancelLoading}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-xs"
                    >
                      {cancelLoading && <Loader2 size={12} className="animate-spin" />}
                      <span>Confirm Cancellation</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Actions Footer */}
            <div className="p-4 sm:p-5 border-t border-brand-gray-100 bg-white shrink-0 space-y-2">
              {booking.status === 'pending' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleQuickStatusChange('confirmed')}
                    disabled={actionLoading !== null}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-4 bg-brand-black text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition-colors shadow-xs disabled:opacity-50"
                  >
                    {actionLoading === 'confirmed' ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}
                    <span>Approve & Confirm</span>
                  </button>
                  <button
                    onClick={() => setIsCancelling(true)}
                    disabled={actionLoading !== null}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors shadow-xs disabled:opacity-50"
                  >
                    <XCircle size={13} />
                    <span>Decline Booking</span>
                  </button>
                </div>
              )}

              {booking.status === 'confirmed' && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleQuickStatusChange('completed')}
                    disabled={actionLoading !== null}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
                  >
                    {actionLoading === 'completed' ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}
                    <span>Mark Completed</span>
                  </button>

                  <button
                    onClick={() => handleQuickStatusChange('no-show')}
                    disabled={actionLoading !== null}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-brand-gray-100 text-brand-gray-800 rounded-xl text-xs font-bold hover:bg-brand-gray-200 transition-colors shadow-xs disabled:opacity-50"
                  >
                    {actionLoading === 'no-show' ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <AlertTriangle size={13} />
                    )}
                    <span>Mark No-Show</span>
                  </button>

                  <button
                    onClick={() => setIsCancelling(true)}
                    disabled={actionLoading !== null}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors shadow-xs disabled:opacity-50"
                  >
                    <XCircle size={13} />
                    <span>Cancel</span>
                  </button>
                </div>
              )}

              {(booking.status === 'completed' || booking.status === 'no-show' || booking.status === 'cancelled') && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-brand-gray-500 font-medium">
                    Status: <strong className="text-brand-black">{statusBadge.label}</strong>
                  </span>
                  <button
                    onClick={() => setIsRescheduling(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-brand-black hover:underline"
                  >
                    <RotateCcw size={12} />
                    <span>Re-open / Reschedule</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
