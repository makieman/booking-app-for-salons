import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Clock, User, Scissors, Calendar, Check, X, Loader2 } from 'lucide-react';
import { Booking, Service, Attendant } from '../../types';
import { formatPrice, formatPhone } from '../../utils/formatters';
import { formatDisplayDate, formatRequestedDate } from '../../utils/dateUtils';

interface GroupedPendingRequest {
  key: string;
  primaryId: string;
  reference?: string;
  groupId?: string;
  customerName: string;
  phone: string;
  email?: string;
  date: string;
  startTime: string;
  endTime: string;
  createdAt?: string;
  segments: Array<{
    bookingId: string;
    serviceName: string;
    attendantName: string;
    price: number;
    priceMax?: number;
    duration: number;
    startTime: string;
    endTime: string;
  }>;
  totalPrice: number;
  totalPriceMax: number;
  totalDuration: number;
}

interface AdminRequestsTabProps {
  pendingBookings: Booking[];
  loading: boolean;
  actionLoadingId: string | null;
  onStatusUpdate: (bookingId: string, status: 'confirmed' | 'cancelled', groupBookingIds?: string[]) => Promise<void>;
}

export function AdminRequestsTab({
  pendingBookings,
  loading,
  actionLoadingId,
  onStatusUpdate,
}: AdminRequestsTabProps) {
  // Group segments by groupId or reference or individual _id
  const groupedRequests = useMemo(() => {
    const groups: Record<string, GroupedPendingRequest> = {};

    for (const b of pendingBookings) {
      const groupKey = b.groupId ? `grp_${b.groupId}` : b.reference ? `ref_${b.reference}` : `single_${b._id}`;

      const serviceObj = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
      const serviceName = serviceObj ? serviceObj.name : 'Service';
      const attendantName =
        b.attendantId && typeof b.attendantId === 'object'
          ? (b.attendantId as Attendant).name
          : 'Any available';

      const segPrice = b.price !== undefined ? b.price : serviceObj?.price || 0;
      const segPriceMax = serviceObj?.priceMax || segPrice;
      const segDuration = serviceObj?.duration || 60;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          primaryId: b._id,
          reference: b.reference,
          groupId: b.groupId,
          customerName: b.customerName,
          phone: b.phone,
          email: b.email,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          createdAt: b.createdAt,
          segments: [],
          totalPrice: 0,
          totalPriceMax: 0,
          totalDuration: 0,
        };
      }

      groups[groupKey].segments.push({
        bookingId: b._id,
        serviceName,
        attendantName,
        price: segPrice,
        priceMax: segPriceMax,
        duration: segDuration,
        startTime: b.startTime,
        endTime: b.endTime,
      });

      groups[groupKey].totalPrice += segPrice;
      groups[groupKey].totalPriceMax += segPriceMax;
      groups[groupKey].totalDuration += segDuration;

      // Update earliest start and latest end times
      if (b.startTime < groups[groupKey].startTime) groups[groupKey].startTime = b.startTime;
      if (b.endTime > groups[groupKey].endTime) groups[groupKey].endTime = b.endTime;
    }

    return Object.values(groups);
  }, [pendingBookings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-brand-gray-100 pb-4 gap-2">
        <div>
          <h2 className="text-2xl font-serif font-black uppercase text-brand-black">Pending Requests</h2>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-400 mt-1">
            Review and confirm client appointment requests
          </p>
        </div>
        {groupedRequests.length > 0 && (
          <div className="bg-amber-50 text-amber-800 border border-amber-200/70 px-3 py-1.5 rounded-xl text-xs font-bold self-start sm:self-auto">
            {groupedRequests.length} awaiting action
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-16 text-center border border-brand-gray-100 bg-white rounded-2xl flex items-center justify-center gap-3 text-brand-gray-500 font-medium text-sm">
            <Loader2 size={18} className="animate-spin text-brand-black" />
            <span>Loading pending requests...</span>
          </div>
        ) : groupedRequests.length === 0 ? (
          <div className="p-16 text-center border-2 border-dashed border-brand-gray-100 bg-white rounded-2xl text-brand-gray-400 space-y-1">
            <p className="font-serif italic text-lg text-brand-black">All clear</p>
            <p className="text-xs font-medium text-brand-gray-500">There are no pending booking requests right now.</p>
          </div>
        ) : (
          <AnimatePresence>
            {groupedRequests.map((req, idx) => {
              const isActing = req.segments.some(s => s.bookingId === actionLoadingId) || req.primaryId === actionLoadingId;
              const allBookingIds = req.segments.map(s => s.bookingId);

              return (
                <motion.div
                  key={req.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: idx * 0.03 }}
                  className="bg-white border border-brand-gray-200 rounded-2xl shadow-xs overflow-hidden"
                >
                  {/* Card Header: Client Info & Requested Timestamp */}
                  <div className="px-5 py-4 bg-brand-gray-50/50 border-b border-brand-gray-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-black text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {req.customerName
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-serif font-bold text-base text-brand-black leading-tight">
                            {req.customerName}
                          </p>
                          {req.reference && (
                            <span className="text-[10px] font-mono font-bold bg-white border border-brand-gray-200 px-1.5 py-0.5 rounded text-brand-gray-600">
                              {req.reference}
                            </span>
                          )}
                        </div>
                        <a
                          href={`tel:${req.phone}`}
                          className="text-xs text-brand-gray-500 hover:text-brand-black font-semibold flex items-center gap-1 mt-0.5"
                        >
                          <Phone size={11} />
                          <span>{formatPhone(req.phone)}</span>
                        </a>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400 block">
                        Requested
                      </span>
                      <span className="text-xs font-semibold text-brand-gray-700">
                        {formatRequestedDate(req.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Body: Appointment Details & Segments */}
                  <div className="p-5 space-y-4">
                    {/* Time & Date bar */}
                    <div className="flex flex-wrap items-center gap-4 bg-brand-gray-50 p-3 rounded-xl border border-brand-gray-100 text-xs">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-brand-gray-500" />
                        <span className="font-bold text-brand-black">
                          {formatDisplayDate(req.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-brand-gray-500" />
                        <span className="font-mono font-bold text-brand-black">
                          {req.startTime} – {req.endTime}
                        </span>
                        <span className="text-brand-gray-400 text-[11px]">({req.totalDuration} mins)</span>
                      </div>
                    </div>

                    {/* Service Segments List */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-gray-400">
                        {req.segments.length > 1 ? `Services in Appointment (${req.segments.length})` : 'Service Booked'}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {req.segments.map((seg, sIdx) => (
                          <div
                            key={seg.bookingId || sIdx}
                            className="p-3 bg-white border border-brand-gray-200 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <p className="font-bold text-brand-black">{seg.serviceName}</p>
                              <p className="text-brand-gray-500 text-[11px] mt-0.5">
                                Stylist: <span className="font-semibold text-brand-gray-800">{seg.attendantName}</span>
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono font-bold text-brand-black">{formatPrice(seg.price, seg.priceMax)}</p>
                              <p className="text-[11px] text-brand-gray-400">{seg.duration} min</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="px-5 py-3.5 bg-brand-gray-50/70 border-t border-brand-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-brand-gray-500 uppercase tracking-wider">Total:</span>
                      <span className="text-base font-mono font-black text-brand-black">
                        {formatPrice(req.totalPrice, req.totalPriceMax > req.totalPrice ? req.totalPriceMax : null)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => onStatusUpdate(req.primaryId, 'cancelled', allBookingIds)}
                        className="flex-1 sm:flex-none px-4 py-2 border border-brand-gray-300 hover:border-red-400 hover:bg-red-50 text-brand-gray-700 hover:text-red-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <X size={13} />
                        <span>Decline</span>
                      </button>
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => onStatusUpdate(req.primaryId, 'confirmed', allBookingIds)}
                        className="flex-1 sm:flex-none px-5 py-2 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        {isActing ? (
                          <Loader2 size={13} className="animate-spin text-white" />
                        ) : (
                          <Check size={13} />
                        )}
                        <span>Confirm Appointment</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
