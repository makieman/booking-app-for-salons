import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Calendar, Clock, Phone, User, Scissors, ArrowRight, CheckCircle2, AlertCircle, Clock4 } from 'lucide-react';
import { Booking, Service, Attendant } from '../../types';
import { formatPrice, formatPhone } from '../../utils/formatters';
import { formatDisplayDate } from '../../utils/dateUtils';

interface AdminSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: Booking[];
  onSelectBooking: (booking: Booking, targetTab: 'ledger' | 'pending') => void;
}

export function AdminSearchModal({
  isOpen,
  onClose,
  bookings,
  onSelectBooking,
}: AdminSearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter matches across all bookings
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const cleanQ = q.replace(/[\s\-\+]/g, '');

    return bookings
      .filter(b => {
        const nameMatch = b.customerName?.toLowerCase().includes(q) || false;
        const refMatch = b.reference?.toLowerCase().includes(q) || false;
        const cleanPhone = (b.phone || '').replace(/[\s\-\+]/g, '');
        const phoneMatch = cleanPhone.includes(cleanQ) || (b.phone || '').toLowerCase().includes(q);
        const svcObj = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
        const serviceMatch = svcObj?.name?.toLowerCase().includes(q) || false;

        return nameMatch || refMatch || phoneMatch || serviceMatch;
      })
      .slice(0, 20); // Top 20 matches
  }, [bookings, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/50 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-brand-gray-200 overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-brand-gray-100 flex items-center gap-3 bg-brand-gray-50/50">
          <Search size={18} className="text-brand-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by client name, phone (0748...), or reference (LMN-G6103)..."
            className="flex-1 bg-transparent text-sm font-semibold text-brand-black placeholder:text-brand-gray-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-bold text-brand-gray-400 hover:text-brand-black p-1 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
          <span className="text-[10px] font-mono text-brand-gray-400 bg-white border border-brand-gray-200 px-1.5 py-0.5 rounded shadow-2xs">
            ESC
          </span>
        </div>

        {/* Results Area */}
        <div className="overflow-y-auto p-3 space-y-2 flex-1">
          {!query.trim() ? (
            <div className="py-12 text-center text-brand-gray-400 space-y-1">
              <p className="font-serif italic text-sm text-brand-black">Quick Search</p>
              <p className="text-xs">
                Type a client name, telephone number, or booking reference like <span className="font-mono font-bold text-brand-black">LMN-G6103</span>.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-brand-gray-400 space-y-1">
              <p className="font-serif italic text-sm text-brand-black">No matches found</p>
              <p className="text-xs">
                No appointments found matching "{query}". Check spelling, phone number digits, or booking code.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
                <span>Matching Appointments ({results.length})</span>
                <span>Click to view details</span>
              </div>

              {results.map(b => {
                const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
                const att =
                  b.attendantId && typeof b.attendantId === 'object'
                    ? (b.attendantId as Attendant)
                    : null;
                const price = b.price || svc?.price || 0;
                const isPending = b.status === 'pending';
                const isConfirmed = b.status === 'confirmed';
                const isCompleted = b.status === 'completed';

                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => {
                      onSelectBooking(b, isPending ? 'pending' : 'ledger');
                      onClose();
                    }}
                    className="w-full text-left p-3 rounded-xl border border-brand-gray-200 bg-white hover:border-brand-black hover:bg-brand-gray-50/70 transition-all flex items-center justify-between gap-4 cursor-pointer group shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-brand-black text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        {b.customerName
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-serif font-bold text-sm text-brand-black group-hover:underline">
                            {b.customerName}
                          </span>
                          {b.reference && (
                            <span className="text-[10px] font-mono font-bold bg-brand-gray-100 text-brand-black border border-brand-gray-200 px-1.5 py-0.2 rounded">
                              {b.reference}
                            </span>
                          )}
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isPending
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : isConfirmed
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : isCompleted
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-brand-gray-100 text-brand-gray-600'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-brand-gray-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 font-mono">
                            <Phone size={11} className="text-brand-gray-400" />
                            {formatPhone(b.phone)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Scissors size={11} className="text-brand-gray-400" />
                            {svc ? svc.name : 'Custom Service'}
                          </span>
                          {att && (
                            <span className="flex items-center gap-1">
                              <User size={11} className="text-brand-gray-400" />
                              {att.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: Date, Time & Action */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1 text-xs font-bold text-brand-black">
                        <Calendar size={12} className="text-brand-gray-400" />
                        <span>{formatDisplayDate(b.date)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 text-[11px] font-mono text-brand-gray-500 mt-0.5">
                        <Clock size={11} className="text-brand-gray-400" />
                        <span>
                          {b.startTime} - {b.endTime}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-black group-hover:underline mt-1">
                        {isPending ? 'View Request →' : 'View in Ledger →'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-brand-gray-50 border-t border-brand-gray-100 flex items-center justify-between text-[11px] text-brand-gray-400">
          <span>
            Searching across <strong>{bookings.length}</strong> total salon bookings
          </span>
          <span className="font-mono">Tip: Use ⌘K to open anytime</span>
        </div>
      </motion.div>
    </div>
  );
}
