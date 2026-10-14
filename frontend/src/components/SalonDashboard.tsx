import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, AlertCircle, Sparkles, ChevronRight, Clock, Users, ArrowRight } from 'lucide-react';
import { Booking, Service, Attendant } from '../types';

interface SalonDashboardProps {
  bookings: Booking[];
  pendingCount: number;
  onNavigateTab: (tab: 'dashboard' | 'ledger' | 'pending' | 'services' | 'staff' | 'settings') => void;
  services?: Service[];
  todayBookings?: Booking[];
}

function formatYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SalonDashboard({
  bookings,
  pendingCount,
  onNavigateTab,
  services = [],
  todayBookings = [],
}: SalonDashboardProps) {
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'all'>('week');

  // -- Calculate Date Boundaries & Metrics -------------------------------------
  const metrics = useMemo(() => {
    const now = new Date();
    const todayStr = formatYmd(now);

    // Calculate start (Mon 00:00:00) and end (Sun 23:59:59) of current week
    const dayOfWeek = now.getDay() || 7; // 1 = Mon, 7 = Sun
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfWeekStr = formatYmd(startOfWeek);
    const endOfWeekStr = formatYmd(endOfWeek);

    // Calculate start and end of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfMonthStr = formatYmd(startOfMonth);
    const endOfMonthStr = formatYmd(endOfMonth);

    // Filter active (non-cancelled) bookings based on timeframe
    const activeBookings = bookings.filter(b => b.status !== 'cancelled');

    const filtered = activeBookings.filter(b => {
      if (!b.date) return false;
      if (timeframe === 'week') {
        return b.date >= startOfWeekStr && b.date <= endOfWeekStr;
      }
      if (timeframe === 'month') {
        return b.date >= startOfMonthStr && b.date <= endOfMonthStr;
      }
      return true; // 'all'
    });

    // -- Day-by-Day Breakdown for Weekly Bar Chart (Mon through Sun) -----------
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let weeklyTotal = 0;
    const dailyCounts = daysOfWeek.map((dayLabel, idx) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + idx);
      const dStr = formatYmd(d);
      const count = bookings.filter(b => b.date === dStr && b.status !== 'cancelled').length;
      weeklyTotal += count;
      const isToday = dStr === todayStr;
      return { dayLabel, count, isToday, dateStr: dStr };
    });
    const maxDailyCount = Math.max(...dailyCounts.map(d => d.count), 1);

    // -- Top Booked Services Breakdown -----------------------------------------
    const serviceMap: Record<string, { name: string; count: number }> = {};
    filtered.forEach(b => {
      let sId = '';
      let sName = '';

      if (typeof b.serviceId === 'object' && b.serviceId) {
        const s = b.serviceId as Service;
        sId = s._id;
        sName = s.name;
      } else if (typeof b.serviceId === 'string' && b.serviceId) {
        sId = b.serviceId;
        const found = services.find(s => s._id === b.serviceId);
        sName = found ? found.name : 'Custom Service';
      }

      if (sId) {
        if (!serviceMap[sId]) {
          serviceMap[sId] = { name: sName || 'Unknown Service', count: 0 };
        }
        serviceMap[sId].count += 1;
      }
    });

    const topServices = Object.values(serviceMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    return {
      totalBookings: filtered.length,
      weeklyTotal,
      dailyCounts,
      maxDailyCount,
      topServices,
      todayConfirmedCount: todayBookings.filter(b => b.status === 'confirmed').length,
    };
  }, [bookings, timeframe, services, todayBookings]);

  return (
    <div className="space-y-6 sm:space-y-8 pb-10">
      {/* -- Header Row: Page Title on Left, Segmented Filter on Right ---------- */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-brand-gray-100 pb-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif font-black tracking-tight uppercase text-brand-black">
            Bookings Overview
          </h2>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-gray-400 mt-1">
            Studio Performance & Metrics
          </p>
        </div>

        {/* Timeframe Filter Switcher */}
        <div className="flex bg-brand-gray-100/60 p-1 rounded-xl self-start sm:self-auto border border-brand-gray-100">
          {(['week', 'month', 'all'] as const).map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-black ${
                timeframe === tf
                  ? 'bg-brand-black text-white shadow-sm'
                  : 'text-brand-gray-600 hover:text-brand-black'
              }`}
            >
              {tf === 'week' ? 'This Week' : tf === 'month' ? 'This Month' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* -- Row 1: Stat Cards in Equal-Width Row (12 columns: 4 / 4 / 4 at lg) -- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Bookings for Selected Timeframe */}
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl shadow-sm space-y-2 hover:border-brand-black transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-brand-gray-500">
              Bookings
            </span>
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
              <Calendar size={18} />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-brand-black tracking-tight">
            {metrics.totalBookings}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
            {timeframe === 'week'
              ? 'This week (Mon – Sun)'
              : timeframe === 'month'
              ? 'Current month'
              : 'All time logged'}
          </p>
        </motion.div>

        {/* Card 2: Pending Requests */}
        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => onNavigateTab('pending')}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onNavigateTab('pending')}
          className="bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl shadow-sm space-y-2 cursor-pointer hover:border-brand-black transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-black"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-brand-gray-500">
              Pending Requests
            </span>
            <div
              className={`p-2.5 rounded-xl ${
                pendingCount > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-brand-gray-50 text-brand-gray-400'
              }`}
            >
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-3xl sm:text-4xl font-black text-brand-black tracking-tight">
              {pendingCount}
            </p>
            <ChevronRight size={18} className="text-brand-gray-400 group-hover:translate-x-1 transition-transform" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">
            {pendingCount > 0 ? 'Needs approval' : 'All clear'}
          </p>
        </motion.div>

        {/* Card 3: Confirmed Today */}
        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => onNavigateTab('ledger')}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onNavigateTab('ledger')}
          className="bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl shadow-sm space-y-2 cursor-pointer hover:border-brand-black transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-black sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-brand-gray-500">
              Confirmed Today
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
              <Clock size={18} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-3xl sm:text-4xl font-black text-brand-black tracking-tight">
              {metrics.todayConfirmedCount}
            </p>
            <ChevronRight size={18} className="text-brand-gray-400 group-hover:translate-x-1 transition-transform" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
            {metrics.todayConfirmedCount > 0 ? 'Active schedule today' : 'No bookings today'}
          </p>
        </motion.div>
      </div>

      {/* -- Row 2: Weekly Volume Chart -------- */}
      <div className="bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-brand-black">
              Weekly Volume Distribution
            </h3>
            <p className="text-[11px] font-bold text-brand-gray-400 uppercase tracking-wider">
              Bookings per day (Mon – Sun)
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-black text-brand-black uppercase tracking-wider">
              {metrics.weeklyTotal} total
            </span>
            <p className="text-[10px] text-brand-gray-400 font-bold uppercase tracking-widest">
              This week
            </p>
          </div>
        </div>

        {metrics.weeklyTotal === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center border-2 border-dashed border-brand-gray-100 rounded-xl bg-brand-gray-50/40 p-6 text-center">
            <Calendar size={28} className="text-brand-gray-300 mb-2" />
            <p className="text-xs font-serif italic text-brand-gray-500">
              No bookings recorded for this week yet.
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gray-400 mt-1">
              New appointments will appear here day by day.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44 pt-4 border-b border-brand-gray-100 pb-2">
            {metrics.dailyCounts.map((d, idx) => {
              const heightPercent = d.count > 0
                ? Math.max(Math.round((d.count / metrics.maxDailyCount) * 100), 16)
                : 6;

              return (
                <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end group">
                  <span
                    className={`text-[10px] font-black transition-opacity ${
                      d.count > 0 ? 'text-brand-black opacity-90' : 'text-brand-gray-300 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {d.count}
                  </span>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    title={`${d.dayLabel}: ${d.count} bookings`}
                    className={`w-full max-w-[36px] rounded-t-lg transition-all duration-500 ${
                      d.isToday
                        ? 'bg-brand-black shadow-md'
                        : d.count > 0
                        ? 'bg-brand-gray-400 hover:bg-brand-black'
                        : 'bg-brand-gray-100'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider ${
                      d.isToday ? 'text-brand-black font-extrabold underline' : 'text-brand-gray-400'
                    }`}
                  >
                    {d.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* -- Row 3: Top Services (5 cols) & Today's Schedule Table (7 cols) ------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Top Performing Services (5 columns on desktop) */}
        <div className="lg:col-span-5 bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-brand-gray-100 pb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-brand-black">
                Top Hairstyles & Services
              </h3>
              <Sparkles size={14} className="text-amber-600" />
            </div>

            {metrics.topServices.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs italic font-serif text-brand-gray-400">
                  No service metrics recorded for this timeframe yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                {metrics.topServices.map((service, i) => {
                  const totalCount = metrics.topServices.reduce((a, b) => a + b.count, 0) || 1;
                  const pct = Math.round((service.count / totalCount) * 100);
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-brand-black truncate max-w-[70%]">
                          {i + 1}. {service.name}
                        </span>
                        <span className="text-brand-gray-500 font-mono">
                          {service.count} booked
                        </span>
                      </div>
                      <div className="w-full bg-brand-gray-100 h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="bg-brand-black h-full rounded-full transition-all duration-700"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('services')}
            className="pt-3 text-[11px] font-black uppercase tracking-widest text-brand-gray-500 hover:text-brand-black flex items-center gap-1 transition-colors self-start focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-black"
          >
            <span>View all services catalog</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Today's Appointments List / Table (7 columns on desktop) */}
        <div className="lg:col-span-7 bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-brand-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-brand-black">
                  Today's Appointments
                </h3>
                <p className="text-[11px] font-bold text-brand-gray-400 uppercase tracking-wider">
                  Confirmed client schedule
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('ledger')}
                className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-brand-gray-500 hover:text-brand-black flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-black"
              >
                <span>Full Ledger</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {todayBookings.length === 0 ? (
              <div className="py-12 text-center">
                <Clock size={24} className="text-brand-gray-300 mx-auto mb-2" />
                <p className="text-xs font-serif italic text-brand-gray-400">
                  No confirmed appointments scheduled for today.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-brand-gray-100/60 pt-1">
                {todayBookings.slice(0, 4).map((booking, idx) => {
                  const serviceName = typeof booking.serviceId === 'object' && booking.serviceId
                    ? booking.serviceId.name
                    : 'Service';
                  const attendantName = booking.attendantId && typeof booking.attendantId === 'object'
                    ? (booking.attendantId as Attendant).name
                    : 'Any Stylist';

                  return (
                    <div
                      key={booking._id || idx}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-brand-gray-50/50 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand-black text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                          {booking.customerName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-brand-black truncate">
                            {booking.customerName}
                          </p>
                          <p className="text-[11px] text-brand-gray-500 truncate">
                            {serviceName} &bull; <span className="italic">{attendantName}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-brand-black font-mono">
                          {booking.startTime}
                        </span>
                        <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-600">
                          Confirmed
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {todayBookings.length > 4 && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gray-400 pt-2 text-center">
              + {todayBookings.length - 4} more appointments in daily ledger
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
