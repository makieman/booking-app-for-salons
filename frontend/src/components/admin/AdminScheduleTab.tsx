import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar as CalendarIcon,
  CalendarRange,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Search,
  Filter,
  Columns,
  List,
  Phone,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Plus,
} from 'lucide-react';
import { Booking, Service, Attendant, BookingStatus } from '../../types';
import { formatPrice } from '../../utils/formatters';
import {
  getTodayDateString,
  getCurrentTimeString,
  formatDisplayDate,
  formatDateInTimezone,
} from '../../utils/dateUtils';
import { BookingDetailDrawer } from './BookingDetailDrawer';
import { AdminCreateBookingModal } from './AdminCreateBookingModal';
import { AdminUpdateBookingPayload } from '../../api/client';

interface AdminScheduleTabProps {
  bookings: Booking[];
  attendants: Attendant[];
  services: Service[];
  onUpdateBooking: (bookingId: string, payload: AdminUpdateBookingPayload) => Promise<void>;
  onBookingCreated?: (newBooking: Booking) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error') => void;
  loading?: boolean;
}

export type ScheduleScope = 'day' | 'week' | 'month';
export type DayLayoutMode = 'ledger' | 'timeline';

export function AdminScheduleTab({
  bookings,
  attendants,
  services,
  onUpdateBooking,
  onBookingCreated,
  triggerToast = () => {},
  loading = false,
}: AdminScheduleTabProps) {
  const todayStr = getTodayDateString();
  const currentTime = getCurrentTimeString();

  // Detect mobile screen (<1024px)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  // View state:
  // - scope: 'day' | 'week' | 'month' (default: 'day')
  // - dayLayout: on mobile default to 'ledger' (List), on desktop 'timeline' (Columns)
  const [scope, setScope] = useState<ScheduleScope>('day');
  const [dayLayout, setDayLayout] = useState<DayLayoutMode>(isMobile ? 'ledger' : 'timeline');

  // Dropdown open state for scope selector
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setScopeDropdownOpen(false);
      }
    };
    if (scopeDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [scopeDropdownOpen]);

  // Selected date (defaults to today)
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStylistId, setSelectedStylistId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'completed' | 'no-show'>('all');

  // Drawer state
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Walk-in / New Appointment Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Date Navigation step logic depending on scope
  const handleShiftDate = (direction: -1 | 1) => {
    if (scope === 'day') {
      const current = new Date(`${selectedDate}T12:00:00Z`);
      current.setUTCDate(current.getUTCDate() + direction);
      setSelectedDate(formatDateInTimezone(current));
    } else if (scope === 'week') {
      const current = new Date(`${selectedDate}T12:00:00Z`);
      current.setUTCDate(current.getUTCDate() + direction * 7);
      setSelectedDate(formatDateInTimezone(current));
    } else if (scope === 'month') {
      const parts = selectedDate.split('-').map(Number);
      const nextMonth = new Date(Date.UTC(parts[0], parts[1] - 1 + direction, 1));
      setSelectedDate(formatDateInTimezone(nextMonth));
    }
  };

  const handleSetCurrentScope = () => {
    setSelectedDate(todayStr);
  };

  // Find all group bookings for selected drawer booking
  const selectedGroupBookings = useMemo(() => {
    if (!selectedBooking?.groupId) return [];
    return bookings
      .filter(b => b.groupId === selectedBooking.groupId)
      .sort((a, b) => (a.groupOrder || 1) - (b.groupOrder || 1));
  }, [bookings, selectedBooking]);

  // Appointments for the selected date
  const dateAppointments = useMemo(() => {
    return bookings.filter(b => {
      if (b.date !== selectedDate) return false;
      if (b.status === 'cancelled') return false;
      return true;
    });
  }, [bookings, selectedDate]);

  // Filtered appointments for day view
  const filteredAppointments = useMemo(() => {
    return dateAppointments.filter(b => {
      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      // Stylist filter
      if (selectedStylistId !== 'all') {
        const attId =
          b.attendantId && typeof b.attendantId === 'object'
            ? (b.attendantId as Attendant)._id
            : b.attendantId;
        if (attId !== selectedStylistId) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const customerMatch = b.customerName.toLowerCase().includes(q);
        const phoneMatch = b.phone.toLowerCase().includes(q);
        const refMatch = b.reference?.toLowerCase().includes(q) || false;
        const svcObj = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
        const serviceMatch = svcObj?.name.toLowerCase().includes(q) || false;
        if (!customerMatch && !phoneMatch && !refMatch && !serviceMatch) return false;
      }

      return true;
    });
  }, [dateAppointments, statusFilter, selectedStylistId, searchQuery]);

  // Metrics for date bar
  const confirmedCount = dateAppointments.filter(b => b.status === 'confirmed').length;
  const completedCount = dateAppointments.filter(b => b.status === 'completed').length;
  const noShowCount = dateAppointments.filter(b => b.status === 'no-show').length;

  // Active stylists for timeline columns
  const activeAttendants = useMemo(() => {
    return attendants.filter(a => a.isActive !== false);
  }, [attendants]);

  // Timeline time slots (08:00 to 20:00)
  const timelineHours = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
  ];

  // Week View: calculate 7 days (Monday through Sunday)
  const weekDays = useMemo(() => {
    const current = new Date(`${selectedDate}T12:00:00Z`);
    const dayOfWeek = current.getUTCDay(); // 0 is Sunday
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(current);
    monday.setUTCDate(current.getUTCDate() + distanceToMonday);

    const days: Array<{ dateStr: string; label: string; dayNum: string; isSelected: boolean; isToday: boolean }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const dStr = formatDateInTimezone(d);
      days.push({
        dateStr: dStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        dayNum: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
        isSelected: dStr === selectedDate,
        isToday: dStr === todayStr,
      });
    }
    return days;
  }, [selectedDate, todayStr]);

  // Month View calculations
  const monthInfo = useMemo(() => {
    const parts = selectedDate.split('-').map(Number);
    const year = parts[0];
    const month = parts[1] - 1; // 0-indexed
    const firstDay = new Date(Date.UTC(year, month, 1));
    const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    // Day of week of first day (0 = Sun, 1 = Mon, ..., 6 = Sat). Convert to Monday-first (0 = Mon, ..., 6 = Sun)
    const firstDayOfWeek = (firstDay.getUTCDay() + 6) % 7;

    // All active bookings in this month
    const monthBookings = bookings.filter(b => b.date.startsWith(monthStr) && b.status !== 'cancelled');
    const confirmedMonthCount = monthBookings.filter(b => b.status === 'confirmed').length;
    const completedMonthCount = monthBookings.filter(b => b.status === 'completed').length;
    const totalMonthRevenue = monthBookings.reduce((sum, b) => {
      const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
      return sum + (b.price || svc?.price || 0);
    }, 0);

    // Days grid array
    const calendarCells: Array<{ dayNum?: number; dateStr?: string; isToday?: boolean; bookingsCount?: number; revenue?: number }> = [];
    // Padding before 1st of month
    for (let i = 0; i < firstDayOfWeek; i++) {
      calendarCells.push({});
    }
    // Days 1..totalDays
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
      const dayBks = monthBookings.filter(b => b.date === dateStr);
      const rev = dayBks.reduce((sum, b) => {
        const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
        return sum + (b.price || svc?.price || 0);
      }, 0);

      calendarCells.push({
        dayNum: d,
        dateStr,
        isToday: dateStr === todayStr,
        bookingsCount: dayBks.length,
        revenue: rev,
      });
    }

    return {
      monthName,
      monthStr,
      totalBookings: monthBookings.length,
      confirmedCount: confirmedMonthCount,
      completedCount: completedMonthCount,
      totalRevenue: totalMonthRevenue,
      calendarCells,
    };
  }, [selectedDate, bookings, todayStr]);

  // Dynamic header date label
  const headerDateLabel = useMemo(() => {
    if (scope === 'day') {
      return formatDisplayDate(selectedDate, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } else if (scope === 'week') {
      const start = formatDisplayDate(weekDays[0].dateStr, { month: 'short', day: 'numeric' });
      const end = formatDisplayDate(weekDays[6].dateStr, { month: 'short', day: 'numeric', year: 'numeric' });
      return `Week of ${start} – ${end}`;
    } else {
      return monthInfo.monthName;
    }
  }, [scope, selectedDate, weekDays, monthInfo.monthName]);

  return (
    <div className="space-y-6">
      {/* ── Schedule Control & Date Navigator Bar ── */}
      <div className="bg-white border border-brand-gray-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Top Row: Date Step Buttons & Calendar Input */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center border border-brand-gray-300 rounded-xl overflow-hidden bg-white shadow-xs">
              <button
                onClick={() => handleShiftDate(-1)}
                className="p-2 hover:bg-brand-gray-50 text-brand-black transition-colors"
                title={scope === 'day' ? 'Previous Day' : scope === 'week' ? 'Previous Week' : 'Previous Month'}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={handleSetCurrentScope}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-x border-brand-gray-300 transition-colors ${
                  (scope === 'day' && selectedDate === todayStr) ||
                  (scope === 'week' && weekDays.some(w => w.isToday && w.isSelected)) ||
                  (scope === 'month' && selectedDate.startsWith(todayStr.slice(0, 7)))
                    ? 'bg-brand-black text-white'
                    : 'hover:bg-brand-gray-50 text-brand-black'
                }`}
              >
                {scope === 'day' ? 'Today' : scope === 'week' ? 'This Week' : 'This Month'}
              </button>
              <button
                onClick={() => handleShiftDate(1)}
                className="p-2 hover:bg-brand-gray-50 text-brand-black transition-colors"
                title={scope === 'day' ? 'Next Day' : scope === 'week' ? 'Next Week' : 'Next Month'}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={e => e.target.value && setSelectedDate(e.target.value)}
                className="bg-white border border-brand-gray-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
              />
              <span className="text-sm font-serif font-black text-brand-black hidden sm:inline">
                {headerDateLabel}
              </span>
            </div>
          </div>

          {/* Controls Right: Scope Dropdown Selector & Day View Sub-toggle */}
          <div className="flex items-center gap-2 self-start lg:self-auto">
            {/* ── Dropdown Button (Daily / Weekly / Monthly) ── */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setScopeDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-brand-gray-300 hover:border-brand-black rounded-xl text-xs font-bold text-brand-black shadow-xs transition-all"
              >
                {scope === 'day' && <CalendarIcon size={14} className="text-brand-black" />}
                {scope === 'week' && <CalendarRange size={14} className="text-brand-black" />}
                {scope === 'month' && <CalendarDays size={14} className="text-brand-black" />}
                <span className="font-extrabold uppercase tracking-wide">
                  {scope === 'day' ? 'Today / Day' : scope === 'week' ? 'Weekly' : 'Monthly'}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-brand-gray-500 transition-transform duration-200 ${
                    scopeDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {scopeDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-1.5 w-60 bg-white border border-brand-gray-200 rounded-2xl shadow-xl z-30 p-1.5 space-y-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setScope('day');
                        setScopeDropdownOpen(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left text-xs transition-colors ${
                        scope === 'day' ? 'bg-brand-black text-white' : 'hover:bg-brand-gray-50 text-brand-black'
                      }`}
                    >
                      <CalendarIcon size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Daily View</p>
                        <p className={`text-[11px] ${scope === 'day' ? 'text-white/70' : 'text-brand-gray-400'}`}>
                          Appointment ledger & hourly schedule
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setScope('week');
                        setScopeDropdownOpen(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left text-xs transition-colors ${
                        scope === 'week' ? 'bg-brand-black text-white' : 'hover:bg-brand-gray-50 text-brand-black'
                      }`}
                    >
                      <CalendarRange size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Weekly View</p>
                        <p className={`text-[11px] ${scope === 'week' ? 'text-white/70' : 'text-brand-gray-400'}`}>
                          7-day schedule & revenue overview
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setScope('month');
                        setScopeDropdownOpen(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left text-xs transition-colors ${
                        scope === 'month' ? 'bg-brand-black text-white' : 'hover:bg-brand-gray-50 text-brand-black'
                      }`}
                    >
                      <CalendarDays size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Monthly View</p>
                        <p className={`text-[11px] ${scope === 'month' ? 'text-white/70' : 'text-brand-gray-400'}`}>
                          Full calendar & monthly volume
                        </p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* In Daily Scope: Desktop Sub-toggle between List and Stylist Columns */}
            {scope === 'day' && (
              <div className="hidden lg:flex items-center gap-1 bg-brand-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDayLayout('ledger')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    dayLayout === 'ledger'
                      ? 'bg-white text-brand-black shadow-xs'
                      : 'text-brand-gray-600 hover:text-brand-black'
                  }`}
                >
                  <List size={13} />
                  <span>List</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDayLayout('timeline')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    dayLayout === 'timeline'
                      ? 'bg-white text-brand-black shadow-xs'
                      : 'text-brand-gray-600 hover:text-brand-black'
                  }`}
                >
                  <Columns size={13} />
                  <span>Stylist Columns</span>
                </button>
              </div>
            )}

            {/* [+ New Appointment / Walk-in Button] */}
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-black text-white hover:bg-neutral-800 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 whitespace-nowrap"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">New Appointment</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        {/* Status Metrics Strip & Quick Search Filter (Daily Scope) */}
        {scope === 'day' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-brand-gray-100">
            <div className="flex items-center gap-2 sm:gap-3 text-xs flex-wrap">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                  statusFilter === 'all'
                    ? 'bg-brand-black text-white border-brand-black shadow-xs'
                    : 'bg-white text-brand-gray-600 border-brand-gray-200 hover:border-brand-black'
                }`}
              >
                All ({dateAppointments.length})
              </button>

              <button
                onClick={() => setStatusFilter('confirmed')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold border transition-all ${
                  statusFilter === 'confirmed'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-400'
                }`}
              >
                <span>Confirmed</span>
                <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">{confirmedCount}</span>
              </button>

              <button
                onClick={() => setStatusFilter('completed')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold border transition-all ${
                  statusFilter === 'completed'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-400'
                }`}
              >
                <span>Completed</span>
                <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">{completedCount}</span>
              </button>

              {noShowCount > 0 && (
                <button
                  onClick={() => setStatusFilter('no-show')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    statusFilter === 'no-show'
                      ? 'bg-neutral-800 text-white border-neutral-800 shadow-xs'
                      : 'bg-neutral-100 text-neutral-800 border-neutral-300'
                  }`}
                >
                  <span>No-Show</span>
                  <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">{noShowCount}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Search Input */}
              <div className="relative flex-1 sm:w-56">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search client or service..."
                  className="w-full bg-white border border-brand-gray-200 rounded-lg pl-8 pr-3 py-1 text-xs text-brand-black placeholder:text-brand-gray-400 focus:outline-none focus:border-brand-black"
                />
              </div>

              {/* Stylist Filter */}
              <select
                value={selectedStylistId}
                onChange={e => setSelectedStylistId(e.target.value)}
                className="bg-white border border-brand-gray-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-black focus:outline-none focus:border-brand-black shadow-xs"
              >
                <option value="all">All Stylists</option>
                {activeAttendants.map(att => (
                  <option key={att._id} value={att._id}>
                    {att.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── SCOPE 1: DAILY VIEW ── */}
      {scope === 'day' && (
        <>
          {/* Day Layout: Stylist Timeline Columns (Desktop only when chosen) */}
          {dayLayout === 'timeline' && !isMobile ? (
            <div className="bg-white border border-brand-gray-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <div className="min-w-[760px]">
                  {/* Columns Header */}
                  <div className="grid grid-cols-[80px_repeat(auto-fit,minmax(200px,1fr))] border-b border-brand-gray-200 bg-brand-gray-50/80 sticky top-0 z-20">
                    <div className="p-3 text-center border-r border-brand-gray-200 text-[11px] font-bold uppercase tracking-wider text-brand-gray-500">
                      Time
                    </div>
                    {activeAttendants.map(att => (
                      <div
                        key={att._id}
                        className="p-3 border-r border-brand-gray-200 text-left flex items-center justify-between"
                      >
                        <div>
                          <h4 className="text-xs font-bold text-brand-black">{att.name}</h4>
                          <p className="text-[10px] text-brand-gray-500">
                            {dateAppointments.filter(b => {
                              const attId =
                                b.attendantId && typeof b.attendantId === 'object'
                                  ? (b.attendantId as Attendant)._id
                                  : b.attendantId;
                              return attId === att._id;
                            }).length}{' '}
                            booked
                          </p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active" />
                      </div>
                    ))}
                  </div>

                  {/* Timeline Hours Grid */}
                  <div className="divide-y divide-brand-gray-100">
                    {timelineHours.map(hour => {
                      return (
                        <div
                          key={hour}
                          className="grid grid-cols-[80px_repeat(auto-fit,minmax(200px,1fr))] min-h-[72px]"
                        >
                          <div className="p-2 border-r border-brand-gray-200 text-center font-mono font-bold text-xs text-brand-gray-400 bg-brand-gray-50/30">
                            {hour}
                          </div>

                          {activeAttendants.map(att => {
                            const matchingBookings = filteredAppointments.filter(b => {
                              const attId =
                                b.attendantId && typeof b.attendantId === 'object'
                                  ? (b.attendantId as Attendant)._id
                                  : b.attendantId;
                              if (attId !== att._id) return false;
                              const hourPrefix = hour.split(':')[0];
                              return b.startTime.startsWith(hourPrefix);
                            });

                            return (
                              <div
                                key={att._id}
                                className="p-1.5 border-r border-brand-gray-100 hover:bg-brand-gray-50/50 transition-colors space-y-1.5"
                              >
                                {matchingBookings.map(b => {
                                  const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
                                  const isCompleted = b.status === 'completed';
                                  const isNoShow = b.status === 'no-show';

                                  return (
                                    <motion.div
                                      key={b._id}
                                      whileHover={{ scale: 1.01 }}
                                      whileTap={{ scale: 0.99 }}
                                      onClick={() => setSelectedBooking(b)}
                                      className={`p-2.5 rounded-xl border cursor-pointer shadow-xs transition-all ${
                                        isCompleted
                                          ? 'bg-blue-50/80 border-blue-200 hover:border-blue-400'
                                          : isNoShow
                                          ? 'bg-neutral-100 border-neutral-300 opacity-60'
                                          : 'bg-white border-emerald-200 hover:border-emerald-500'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <p className="font-bold text-xs text-brand-black truncate">
                                          {b.customerName}
                                        </p>
                                        <span
                                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                            isCompleted
                                              ? 'bg-blue-100 text-blue-800'
                                              : isNoShow
                                              ? 'bg-neutral-200 text-neutral-800'
                                              : 'bg-emerald-100 text-emerald-800'
                                          }`}
                                        >
                                          {b.startTime}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-brand-gray-600 truncate mt-0.5">
                                        {svc ? svc.name : 'Service'}
                                      </p>
                                      <div className="flex items-center justify-between mt-1 text-[10px] text-brand-gray-400 font-mono">
                                        <span>{b.endTime}</span>
                                        <span className="font-bold text-brand-black font-sans">
                                          {svc ? formatPrice(svc.price, svc.priceMax) : ''}
                                        </span>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Day Layout: Responsive Ledger (Mobile Cards on small screens, Data Table on desktop) */
            <div className="bg-white border border-brand-gray-200 rounded-2xl shadow-xs overflow-hidden">
              {filteredAppointments.length === 0 ? (
                <div className="p-12 text-center text-brand-gray-400 space-y-2">
                  <p className="font-serif italic text-base">No appointments found matching current filters.</p>
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setSelectedStylistId('all');
                      setSearchQuery('');
                    }}
                    className="text-xs font-bold text-brand-black hover:underline"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <>
                  {/* ── Mobile Responsive Cards (<768px) — Clean, Zero Squeeze ── */}
                  <div className="md:hidden divide-y divide-brand-gray-100">
                    {filteredAppointments.map(b => {
                      const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
                      const att =
                        b.attendantId && typeof b.attendantId === 'object'
                          ? (b.attendantId as Attendant)
                          : null;
                      const price = b.price || svc?.price || 0;
                      const isCompleted = b.status === 'completed';
                      const isNoShow = b.status === 'no-show';

                      return (
                        <div
                          key={b._id}
                          onClick={() => setSelectedBooking(b)}
                          className="p-4 hover:bg-brand-gray-50/70 active:bg-brand-gray-100 cursor-pointer transition-colors space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs bg-brand-black text-white px-2 py-0.5 rounded-md">
                                  {b.startTime} – {b.endTime}
                                </span>
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                                    isCompleted
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : isNoShow
                                      ? 'bg-neutral-100 text-neutral-800 border-neutral-300'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </div>
                              <p className="font-bold text-base text-brand-black mt-1 leading-snug">
                                {b.customerName}
                              </p>
                              <a
                                href={`tel:${b.phone}`}
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gray-500 hover:text-brand-black font-mono"
                              >
                                <Phone size={11} />
                                <span>{b.phone}</span>
                              </a>
                            </div>

                            <div className="text-right shrink-0">
                              <p className="font-mono font-black text-base text-brand-black">
                                {formatPrice(price)}
                              </p>
                              <span className="text-xs font-bold text-brand-gray-500 block mt-1 hover:underline">
                                Manage →
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-2 border-t border-brand-gray-100 text-brand-gray-600">
                            <span className="font-semibold text-brand-black truncate max-w-[55%]">
                              {svc ? svc.name : 'Custom Service'}
                            </span>
                            <span className="text-[11px] font-medium text-brand-gray-700">
                              Stylist: <strong className="text-brand-black">{att ? att.name : 'Unassigned'}</strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Desktop Data Table (≥768px) ── */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-brand-gray-200 bg-brand-gray-50/70 text-[10px] font-bold uppercase tracking-wider text-brand-gray-500">
                          <th className="py-3 px-4">Time</th>
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Service</th>
                          <th className="py-3 px-4">Stylist</th>
                          <th className="py-3 px-4">Price</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-gray-100">
                        {filteredAppointments.map(b => {
                          const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
                          const att =
                            b.attendantId && typeof b.attendantId === 'object'
                              ? (b.attendantId as Attendant)
                              : null;

                          return (
                            <tr
                              key={b._id}
                              onClick={() => setSelectedBooking(b)}
                              className="hover:bg-brand-gray-50/70 cursor-pointer transition-colors"
                            >
                              <td className="py-3.5 px-4 font-mono font-bold text-brand-black whitespace-nowrap">
                                {b.startTime} – {b.endTime}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <p className="font-bold text-brand-black">{b.customerName}</p>
                                <p className="text-[11px] text-brand-gray-500">{b.phone}</p>
                              </td>
                              <td className="py-3.5 px-4">
                                <p className="font-semibold text-brand-black">{svc ? svc.name : 'Custom Service'}</p>
                                {svc?.duration && (
                                  <p className="text-[10px] text-brand-gray-400">{svc.duration} mins</p>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-medium text-brand-gray-700 whitespace-nowrap">
                                {att ? att.name : 'Unassigned'}
                              </td>
                              <td className="py-3.5 px-4 font-mono font-bold text-brand-black whitespace-nowrap">
                                {svc ? formatPrice(svc.price, svc.priceMax) : '—'}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                                    b.status === 'completed'
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : b.status === 'no-show'
                                      ? 'bg-neutral-100 text-neutral-800 border-neutral-300'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setSelectedBooking(b);
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold text-brand-black bg-brand-gray-100 hover:bg-brand-black hover:text-white rounded-lg transition-colors"
                                >
                                  Manage
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── SCOPE 2: WEEKLY VIEW ── */}
      {scope === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {weekDays.map(day => {
            const dayBookings = bookings.filter(b => b.date === day.dateStr && b.status !== 'cancelled');
            const dayRevenue = dayBookings.reduce((sum, b) => {
              const svc = typeof b.serviceId === 'object' ? (b.serviceId as Service) : null;
              return sum + (b.price || svc?.price || 0);
            }, 0);

            return (
              <div
                key={day.dateStr}
                onClick={() => {
                  setSelectedDate(day.dateStr);
                  setScope('day');
                }}
                className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-xs space-y-3 ${
                  day.isSelected
                    ? 'bg-brand-black text-white border-brand-black ring-2 ring-brand-black/20'
                    : day.isToday
                    ? 'bg-emerald-50/60 border-emerald-300 hover:border-brand-black'
                    : 'bg-white border-brand-gray-200 hover:border-brand-black'
                }`}
              >
                <div className="flex items-center justify-between border-b pb-2 border-inherit/20">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 block">
                      {day.label}
                    </span>
                    <span className="text-xl font-serif font-black">{day.dayNum}</span>
                  </div>
                  {day.isToday && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-500 text-white">
                      Today
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-xs">
                  <p className="font-semibold">{dayBookings.length} appointments</p>
                  <p className="font-mono font-bold opacity-80">{formatPrice(dayRevenue)}</p>
                </div>

                {dayBookings.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-inherit/10">
                    {dayBookings.slice(0, 3).map(b => (
                      <div
                        key={b._id}
                        className="text-[11px] truncate py-0.5 px-1 rounded bg-black/5 dark:bg-white/10"
                      >
                        <span className="font-mono font-bold mr-1">{b.startTime}</span>
                        <span>{b.customerName}</span>
                      </div>
                    ))}
                    {dayBookings.length > 3 && (
                      <p className="text-[10px] opacity-60 font-medium">+{dayBookings.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── SCOPE 3: MONTHLY VIEW ── */}
      {scope === 'month' && (
        <div className="space-y-4">
          {/* Monthly Metrics Header */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-brand-gray-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-brand-gray-400 block tracking-wider">
                Total Bookings
              </span>
              <p className="text-2xl font-serif font-black text-brand-black mt-0.5">
                {monthInfo.totalBookings}
              </p>
            </div>

            <div className="bg-white border border-brand-gray-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-brand-gray-400 block tracking-wider">
                Confirmed
              </span>
              <p className="text-2xl font-serif font-black text-emerald-700 mt-0.5">
                {monthInfo.confirmedCount}
              </p>
            </div>

            <div className="bg-white border border-brand-gray-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-brand-gray-400 block tracking-wider">
                Completed
              </span>
              <p className="text-2xl font-serif font-black text-blue-700 mt-0.5">
                {monthInfo.completedCount}
              </p>
            </div>

            <div className="bg-brand-black text-white rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-white/70 block tracking-wider">
                Projected Revenue
              </span>
              <p className="text-2xl font-serif font-black text-white mt-0.5">
                {formatPrice(monthInfo.totalRevenue)}
              </p>
            </div>
          </div>

          {/* Monthly Calendar Grid */}
          <div className="bg-white border border-brand-gray-200 rounded-2xl p-4 sm:p-5 shadow-xs">
            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-brand-gray-400 border-b border-brand-gray-100 pb-2">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {monthInfo.calendarCells.map((cell, idx) => {
                if (!cell.dayNum) {
                  return <div key={`empty-${idx}`} className="h-16 sm:h-20 bg-brand-gray-50/40 rounded-xl" />;
                }

                const hasBookings = (cell.bookingsCount || 0) > 0;

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => {
                      if (cell.dateStr) {
                        setSelectedDate(cell.dateStr);
                        setScope('day');
                      }
                    }}
                    className={`h-16 sm:h-24 p-1.5 sm:p-2.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                      cell.isToday
                        ? 'bg-emerald-50/80 border-emerald-400 ring-1 ring-emerald-400'
                        : hasBookings
                        ? 'bg-white border-brand-gray-200 hover:border-brand-black hover:shadow-sm'
                        : 'bg-white/60 border-brand-gray-100 hover:border-brand-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${cell.isToday ? 'text-emerald-800' : 'text-brand-black'}`}>
                        {cell.dayNum}
                      </span>
                      {cell.isToday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Today" />
                      )}
                    </div>

                    {hasBookings ? (
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-bold text-brand-black bg-brand-gray-100 rounded px-1 text-center truncate">
                          {cell.bookingsCount} apt{cell.bookingsCount! > 1 ? 's' : ''}
                        </span>
                        <span className="hidden sm:block text-[9px] font-mono font-semibold text-brand-gray-500 truncate text-right">
                          {formatPrice(cell.revenue || 0)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-brand-gray-300 hidden sm:block">No appts</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Slide-Over Booking Detail Drawer ── */}
      <BookingDetailDrawer
        isOpen={selectedBooking !== null}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
        groupBookings={selectedGroupBookings}
        attendants={activeAttendants}
        services={services}
        onUpdateBooking={async (bookingId, payload) => {
          await onUpdateBooking(bookingId, payload);
          // Update local selected booking if it was modified
          if (selectedBooking && selectedBooking._id === bookingId) {
            setSelectedBooking(prev => (prev ? { ...prev, ...payload } : null));
          }
        }}
        loading={loading}
      />

      {/* ── Walk-in / New Appointment Modal ── */}
      <AdminCreateBookingModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        services={services}
        attendants={activeAttendants}
        defaultDate={selectedDate}
        onBookingCreated={newBooking => {
          if (onBookingCreated) {
            onBookingCreated(newBooking);
          }
        }}
        triggerToast={triggerToast}
      />
    </div>
  );
}
