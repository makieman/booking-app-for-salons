import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  Send,
} from 'lucide-react';
import { Service, Attendant, Booking } from '../../types';
import { formatPrice } from '../../utils/formatters';
import { getTodayDateString } from '../../utils/dateUtils';
import * as api from '../../api/client';

interface AdminCreateBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  attendants: Attendant[];
  defaultDate?: string;
  onBookingCreated: (newBooking: Booking) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminCreateBookingModal({
  isOpen,
  onClose,
  services,
  attendants,
  defaultDate,
  onBookingCreated,
  triggerToast,
}: AdminCreateBookingModalProps) {
  const todayStr = getTodayDateString();

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [attendantId, setAttendantId] = useState('');
  const [date, setDate] = useState(defaultDate || todayStr);
  const [startTime, setStartTime] = useState('10:00');
  const [notes, setNotes] = useState('Walk-in booking');
  const [status, setStatus] = useState<'confirmed' | 'pending'>('confirmed');
  const [sendNotifications, setSendNotifications] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync default date when opened
  useEffect(() => {
    if (isOpen) {
      if (defaultDate) setDate(defaultDate);
      if (services.length > 0 && !serviceId) {
        setServiceId(services[0]._id);
      }
      setError(null);
    }
  }, [isOpen, defaultDate, services]);

  const activeAttendants = attendants.filter(a => a.isActive !== false);

  const standardTimeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim() || !serviceId || !date || !startTime) {
      setError('Please fill in customer name, phone, service, date, and time.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await api.createAdminBooking({
        customerName: customerName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        serviceId,
        attendantId: attendantId || undefined,
        date,
        startTime,
        notes: notes.trim() || undefined,
        status,
        sendNotifications,
      });

      triggerToast('Appointment booked successfully!', 'success');
      onBookingCreated(created);
      onClose();

      // Reset form
      setCustomerName('');
      setPhone('');
      setEmail('');
      setNotes('Walk-in booking');
    } catch (err: any) {
      setError(err.message || 'Failed to create appointment.');
    } finally {
      setLoading(false);
    }
  };

  const selectedService = services.find(s => s._id === serviceId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs z-50"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 m-auto max-w-xl max-h-[90vh] bg-white rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col p-6 sm:p-8"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-brand-gray-100 shrink-0">
              <div>
                <h3 className="text-xl font-serif font-black text-brand-black">New Appointment</h3>
                <p className="text-xs text-brand-gray-500 mt-0.5">
                  Direct walk-in or telephone client booking
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-brand-gray-400 hover:text-brand-black hover:bg-brand-gray-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Client Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Customer Name *
                  </label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. Mary Wanjiku"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      className="w-full bg-white border border-brand-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-brand-black focus:outline-none focus:border-brand-black shadow-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 0712345678"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full bg-white border border-brand-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-brand-black focus:outline-none focus:border-brand-black shadow-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Email */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                  Email Address (Optional)
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                  <input
                    type="email"
                    placeholder="e.g. client@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-white border border-brand-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
                  />
                </div>
              </div>

              {/* Service Selection */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Service *
                  </label>
                  {selectedService && (
                    <span className="text-xs font-mono font-bold text-brand-black">
                      {formatPrice(selectedService.price, selectedService.priceMax)} ({selectedService.duration} min)
                    </span>
                  )}
                </div>
                <select
                  required
                  value={serviceId}
                  onChange={e => setServiceId(e.target.value)}
                  className="w-full bg-white border border-brand-gray-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
                >
                  <option value="" disabled>Select a salon service...</option>
                  {services.map(s => (
                    <option key={s._id} value={s._id}>
                      {s.name} — {formatPrice(s.price)} ({s.duration} min)
                    </option>
                  ))}
                </select>
              </div>

              {/* Stylist & Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Assign Stylist
                  </label>
                  <select
                    value={attendantId}
                    onChange={e => setAttendantId(e.target.value)}
                    className="w-full bg-white border border-brand-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
                  >
                    <option value="">Any Available / Auto-assign</option>
                    {activeAttendants.map(att => (
                      <option key={att._id} value={att._id}>
                        {att.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Booking Status
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-brand-gray-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setStatus('confirmed')}
                      className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                        status === 'confirmed'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-brand-gray-600 hover:text-brand-black'
                      }`}
                    >
                      Confirmed
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus('pending')}
                      className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                        status === 'pending'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-brand-gray-600 hover:text-brand-black'
                      }`}
                    >
                      Pending
                    </button>
                  </div>
                </div>
              </div>

              {/* Date & Time Slot Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Appointment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-white border border-brand-gray-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                    Start Time *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="w-1/2 bg-white border border-brand-gray-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
                    />
                    <select
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="w-1/2 bg-white border border-brand-gray-300 rounded-xl px-2.5 py-2 text-xs font-semibold text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
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
              </div>

              {/* Internal Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-600 block">
                  Booking Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Walk-in client, requested specific wash..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-white border border-brand-gray-300 rounded-xl px-3 py-2 text-xs text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
                />
              </div>

              {/* Send Notification Checkbox */}
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendNotifications}
                  onChange={e => setSendNotifications(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-black border-brand-gray-300 focus:ring-brand-black"
                />
                <span className="text-xs font-medium text-brand-gray-700">
                  Send confirmation alert to customer via WhatsApp & Email
                </span>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-brand-gray-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-bold text-brand-gray-600 hover:text-brand-black rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-brand-black text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition-all shadow-md active:scale-95"
                >
                  {loading && <Loader2 size={13} className="animate-spin" />}
                  <span>Book Appointment</span>
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
