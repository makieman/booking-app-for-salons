import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, AlertCircle, Sparkles, ChevronRight, ArrowUpRight } from 'lucide-react';
import { Booking, Service } from '../types';

interface SalonDashboardProps {
  bookings: Booking[];
  pendingCount: number;
  onNavigateTab: (tab: 'dashboard' | 'ledger' | 'pending' | 'services' | 'staff' | 'settings') => void;
}

export function SalonDashboard({ bookings, pendingCount, onNavigateTab }: SalonDashboardProps) {
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'all'>('week');

  // -- Calculate Date Boundaries -----------------------------------------------
  const metrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Calculate start of current week (Monday)
    const dayOfWeek = now.getDay() || 7; // 1 = Mon, 7 = Sun
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    // Calculate start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Filter bookings based on timeframe
    const filtered = bookings.filter(b => {
      if (!b.date) return false;
      const bDate = new Date(b.date);
      if (timeframe === 'week') return bDate >= startOfWeek;
      if (timeframe === 'month') return bDate >= startOfMonth;
      return true; // 'all'
    });

    const confirmed = filtered.filter(b => b.status === 'confirmed');
    const completed = filtered.filter(b => b.status === 'completed');
    const activeBookings = [...confirmed, ...completed];

    // -- Day-by-Day Breakdown for Weekly Bar Chart ---------------------------
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyCounts = daysOfWeek.map((dayLabel, idx) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + idx);
      const dStr = d.toISOString().split('T')[0];
      const count = bookings.filter(b => b.date === dStr && (b.status === 'confirmed' || b.status === 'completed')).length;
      const isToday = dStr === todayStr;
      return { dayLabel, count, isToday, dateStr: dStr };
    });
    const maxDailyCount = Math.max(...dailyCounts.map(d => d.count), 1);

    // -- Top Booked Services Breakdown ---------------------------------------
    const serviceMap: Record<string, { name: string; count: number }> = {};
    activeBookings.forEach(b => {
      if (typeof b.serviceId === 'object' && b.serviceId) {
        const s = b.serviceId as Service;
        if (!serviceMap[s._id]) {
          serviceMap[s._id] = { name: s.name, count: 0 };
        }
        serviceMap[s._id].count += 1;
      }
    });

    const topServices = Object.values(serviceMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    return {
      totalBookings: filtered.length,
      dailyCounts,
      maxDailyCount,
      topServices,
    };
  }, [bookings, timeframe]);

  return (
    <div className="space-y-6 px-4 sm:px-0 pb-10">
      {/* -- Top Bar: 2-Word Title & Filter Pills --------------------------- */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-brand-gray-100 pb-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif font-black tracking-tight uppercase">Bookings Overview</h2>
        </div>

        {/* Timeframe Filter Switcher */}
        <div className="flex bg-brand-gray-100/60 p-1 rounded-xl self-start sm:self-auto">
          {(['week', 'month', 'all'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${
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

      {/* -- 2 Key Metric Cards (Bookings & Pending) ------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Total Bookings */}
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-brand-white border border-brand-gray-100 p-5 rounded-2xl shadow-sm space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-brand-gray-500">Bookings</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <Calendar size={18} />
            </div>
          </div>
          <p className="text-3xl font-black text-brand-black tracking-tight">{metrics.totalBookings}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
            {timeframe === 'week' ? 'Past 7 days' : timeframe === 'month' ? 'Current month' : 'Total logged'}
          </p>
        </motion.div>

        {/* Pending Requests */}
        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => onNavigateTab('pending')}
          className="bg-brand-white border border-brand-gray-100 p-5 rounded-2xl shadow-sm space-y-2 cursor-pointer hover:border-brand-black transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-brand-gray-500">Pending Requests</span>
            <div className={`p-2 rounded-xl ${pendingCount > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-brand-gray-50 text-brand-gray-400'}`}>
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-black text-brand-black tracking-tight">{pendingCount}</p>
            <ChevronRight size={18} className="text-brand-gray-400 group-hover:translate-x-1 transition-transform" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">
            {pendingCount > 0 ? 'Needs approval ?' : 'All clear'}
          </p>
        </motion.div>
      </div>

      {/* -- Visual Weekly Trend Bar Chart -------------------------------------- */}
      <div className="bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-brand-black">Weekly Volume Distribution</h3>
            <p className="text-[11px] font-bold text-brand-gray-400 uppercase tracking-wider">Bookings per day (Mon � Sun)</p>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 items-end h-36 pt-4 border-b border-brand-gray-100 pb-2">
          {metrics.dailyCounts.map((d, idx) => {
            const heightPercent = Math.max(Math.round((d.count / metrics.maxDailyCount) * 100), 12);
            return (
              <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end group">
                <span className="text-[10px] font-black text-brand-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.count}
                </span>
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full max-w-[28px] rounded-t-lg transition-all duration-500 ${
                    d.isToday
                      ? 'bg-brand-black shadow-md'
                      : d.count > 0
                      ? 'bg-amber-700/80 hover:bg-brand-black'
                      : 'bg-brand-gray-100'
                  }`}
                />
                <span className={`text-[10px] font-black uppercase tracking-wider ${d.isToday ? 'text-brand-black font-extrabold underline' : 'text-brand-gray-400'}`}>
                  {d.dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* -- Bottom Section: Top Services & Quick Action Bar ----------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Performing Services */}
        <div className="bg-brand-white border border-brand-gray-100 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b border-brand-gray-100 pb-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-brand-black">Top Hairstyles & Services</h3>
            <Sparkles size={14} className="text-amber-600" />
          </div>

          {metrics.topServices.length === 0 ? (
            <p className="text-xs italic text-brand-gray-400 py-4 text-center">No service metrics recorded for this timeframe yet.</p>
          ) : (
            <div className="space-y-3">
              {metrics.topServices.map((service, i) => {
                const totalCount = metrics.topServices.reduce((a, b) => a + b.count, 0) || 1;
                const pct = Math.round((service.count / totalCount) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-brand-black truncate max-w-[70%]">{i + 1}. {service.name}</span>
                      <span className="text-brand-gray-500 font-mono">{service.count} booked</span>
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

        {/* Quick Action Shortcuts Tile */}
        <div className="bg-brand-black text-white p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Quick Actions</p>
            <h3 className="text-xl font-serif italic font-bold">Manage Studio Operations</h3>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-2">
            <button
              onClick={() => onNavigateTab('ledger')}
              className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 transition-all rounded-xl text-xs font-black uppercase tracking-widest flex justify-between items-center text-left"
            >
              <span>View Today's Appointment Queue</span>
              <ArrowUpRight size={16} />
            </button>
            <button
              onClick={() => onNavigateTab('pending')}
              className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 transition-all rounded-xl text-xs font-black uppercase tracking-widest flex justify-between items-center text-left"
            >
              <span>Review Pending Requests ({pendingCount})</span>
              <ArrowUpRight size={16} />
            </button>
            <button
              onClick={() => onNavigateTab('services')}
              className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 transition-all rounded-xl text-xs font-black uppercase tracking-widest flex justify-between items-center text-left"
            >
              <span>Add / Update Hairstyles & Pricing</span>
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
