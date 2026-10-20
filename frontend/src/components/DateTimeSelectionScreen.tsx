import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Users, Clock, Calendar as CalendarIcon, ArrowLeft } from 'lucide-react';
import { Service, Attendant, MultiSlotOption } from '../types';
import * as api from '../api/client';

const NAIROBI_TZ = 'Africa/Nairobi';

/** Format a duration in minutes to e.g. "1h 30m" or "45m" */
function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Format 24-hour "HH:mm" to 12-hour "h:mm AM/PM" */
function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m} ${period}`;
}

/** Get today's date in Africa/Nairobi timezone as 'YYYY-MM-DD' */
function getNairobiToday(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: NAIROBI_TZ }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/** Get initials for staff avatar */
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface DateTimeSelectionScreenProps {
  selectedServices: Service[];
  selectedAttendant: Attendant | null;
  onSelectAttendant: (attendant: Attendant | null) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  selectedTime: string | null;
  onSelectTime: (time: string | null) => void;
  timeSlots: string[];
  multiSlotOptions: MultiSlotOption[];
  totalPrice: number;
  totalDuration: number;
  attendants: Attendant[];
  isLoadingSlots: boolean;
  onContinue: () => void;
  onBack: () => void;
}

export function DateTimeSelectionScreen({
  selectedServices,
  selectedAttendant,
  onSelectAttendant,
  selectedDate,
  onSelectDate,
  selectedTime,
  onSelectTime,
  timeSlots,
  multiSlotOptions,
  totalPrice,
  totalDuration,
  attendants,
  isLoadingSlots,
  onContinue,
  onBack,
}: DateTimeSelectionScreenProps) {
  const nairobiToday = useMemo(() => getNairobiToday(), []);

  // Determine calendar current displayed month from selectedDate or today
  const [displayYearMonth, setDisplayYearMonth] = useState<{ year: number; month: number }>(() => {
    const baseDate = selectedDate || nairobiToday;
    const [y, m] = baseDate.split('-').map(Number);
    return { year: y || new Date().getFullYear(), month: (m || 1) - 1 };
  });

  // Filter chips: 'all' | 'morning' | 'afternoon' | 'evening'
  const [periodFilter, setPeriodFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');

  // Month slot counts: { "YYYY-MM-DD": number }
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [isLoadingMonthCounts, setIsLoadingMonthCounts] = useState(false);

  const monthString = useMemo(() => {
    const y = displayYearMonth.year;
    const m = String(displayYearMonth.month + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [displayYearMonth]);

  // Fetch month availability whenever displayed month, selectedServices, or selectedAttendant changes
  useEffect(() => {
    let isCancelled = false;
    if (selectedServices.length === 0) return;

    const fetchMonth = async () => {
      setIsLoadingMonthCounts(true);
      try {
        const items = selectedServices.map(s => ({
          serviceId: s._id,
          attendantId: selectedAttendant?._id ?? null,
        }));
        const res = await api.getMonthAvailability(monthString, items);
        if (!isCancelled) {
          setMonthCounts(res.counts || {});
        }
      } catch (err) {
        console.warn('[DateTimeSelectionScreen] Failed to fetch month availability, fallback to client estimates', err);
        if (!isCancelled) {
          // Soft fallback: provide default slots so calendar is not completely disabled
          setMonthCounts({});
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingMonthCounts(false);
        }
      }
    };

    fetchMonth();
    return () => {
      isCancelled = true;
    };
  }, [monthString, selectedServices, selectedAttendant]);

  // Auto-select the first day with available slots on initial load or month/staff change
  useEffect(() => {
    if (isLoadingMonthCounts || Object.keys(monthCounts).length === 0) return;

    const isCurrentSelectedValid =
      selectedDate &&
      selectedDate.startsWith(monthString) &&
      selectedDate >= nairobiToday &&
      (monthCounts[selectedDate] ?? 0) > 0;

    if (!isCurrentSelectedValid) {
      // Find first available day in this month
      const days = Object.keys(monthCounts).sort();
      const firstAvailable = days.find(d => d.startsWith(monthString) && d >= nairobiToday && (monthCounts[d] ?? 0) > 0);
      if (firstAvailable && firstAvailable !== selectedDate) {
        onSelectDate(firstAvailable);
      }
    }
  }, [monthCounts, monthString, selectedDate, nairobiToday, isLoadingMonthCounts, onSelectDate]);

  // Calendar month navigation
  const isCurrentNairobiMonth = useMemo(() => {
    const [todayY, todayM] = nairobiToday.split('-').map(Number);
    return displayYearMonth.year === todayY && displayYearMonth.month === todayM - 1;
  }, [displayYearMonth, nairobiToday]);

  const handlePrevMonth = () => {
    if (isCurrentNairobiMonth) return;
    setDisplayYearMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setDisplayYearMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  // Generate calendar days grid
  const calendarDays = useMemo(() => {
    const { year, month } = displayYearMonth;
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => ({
      key: `blank-${i}`,
      isBlank: true,
      dayNum: 0,
      dateStr: '',
    }));

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return {
        key: dateStr,
        isBlank: false,
        dayNum,
        dateStr,
      };
    });

    return [...blanks, ...days];
  }, [displayYearMonth]);

  // Month title formatter (e.g., "October 2026")
  const monthTitle = useMemo(() => {
    const date = new Date(displayYearMonth.year, displayYearMonth.month, 1);
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
  }, [displayYearMonth]);

  // Filtered time slots
  const filteredTimeSlots = useMemo(() => {
    if (periodFilter === 'all') return timeSlots;
    return timeSlots.filter(time => {
      if (periodFilter === 'morning') return time < '12:00';
      if (periodFilter === 'afternoon') return time >= '12:00' && time < '17:00';
      if (periodFilter === 'evening') return time >= '17:00';
      return true;
    });
  }, [timeSlots, periodFilter]);

  // Handle staff chip change
  const handleAttendantChange = (att: Attendant | null) => {
    if ((selectedAttendant?._id ?? null) === (att?._id ?? null)) return;
    onSelectAttendant(att);
    onSelectTime(null); // Clear selected slot when staff changes
  };

  // Full formatted selected date label
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }).format(dt);
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Staff horizontal scroll tracking for 3 pagination indicator dots
  const staffScrollRef = useRef<HTMLDivElement>(null);
  const [staffScrollProgress, setStaffScrollProgress] = useState(0);

  const handleStaffScroll = useCallback(() => {
    if (!staffScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = staffScrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll <= 5) {
      setStaffScrollProgress(0);
      return;
    }
    const ratio = scrollLeft / maxScroll;
    if (ratio < 0.3) {
      setStaffScrollProgress(0);
    } else if (ratio < 0.7) {
      setStaffScrollProgress(1);
    } else {
      setStaffScrollProgress(2);
    }
  }, []);

  const scrollToStaffSegment = useCallback((idx: number) => {
    if (!staffScrollRef.current) return;
    const { scrollWidth, clientWidth } = staffScrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    const target = (idx / 2) * maxScroll;
    staffScrollRef.current.scrollTo({ left: target, behavior: 'smooth' });
    setStaffScrollProgress(idx);
  }, []);

  return (
    <div className="space-y-6 pb-28">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          aria-label="Go back to services selection"
          className="flex items-center gap-2 text-brand-black hover:translate-x-[-3px] transition-all duration-200 min-h-[44px] min-w-[44px] -ml-2 px-2"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Previous</span>
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-gray-400">
          Step 2 of 3
        </span>
      </div>

      <div>
        <h1 className="text-3xl font-serif font-black tracking-tight text-brand-black">
          Select Date & Time
        </h1>
        <p className="text-xs text-brand-gray-500 mt-1">
          Pick your preferred specialist, date, and appointment slot.
        </p>
      </div>

      {/* Staff Selection Row */}
      <section aria-labelledby="staff-row-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 id="staff-row-heading" className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
            Available Staff
          </h2>
          {selectedAttendant && (
            <button
              onClick={() => handleAttendantChange(null)}
              className="text-[11px] font-semibold text-brand-gray-500 hover:text-brand-black underline"
            >
              Reset to Any
            </button>
          )}
        </div>

        <div className="relative">
          <div
            ref={staffScrollRef}
            onScroll={handleStaffScroll}
            className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1 -mx-2 px-2 scroll-smooth"
          >
            {/* "Any professional" chip */}
            <button
              type="button"
              role="radio"
              aria-checked={selectedAttendant === null}
              aria-label="Any professional (first available)"
              onClick={() => handleAttendantChange(null)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border backdrop-blur-md transition-all duration-200 shrink-0 min-h-[44px] ${selectedAttendant === null
                  ? 'bg-[rgba(44,34,30,0.88)] text-white border-white/20 shadow-md ring-2 ring-[#8C4A32]/40'
                  : 'bg-white/70 border-[rgba(232,226,217,0.65)] hover:border-[#D4A359] hover:bg-white/90 text-[#231F1D]'
                }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border ${selectedAttendant === null
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-[rgba(232,226,217,0.8)] bg-brand-gray-50 text-[#231F1D]'
                  }`}
              >
                <Users size={14} />
              </div>
              <div className="text-left leading-tight pr-1">
                <span className="text-xs font-bold block">Any professional</span>
                <span className={`text-[10px] block ${selectedAttendant === null ? 'text-white/80' : 'text-[#6E655F]'}`}>
                  First available
                </span>
              </div>
            </button>

            {/* Individual Staff Chips */}
            {attendants.map(att => {
              const isSelected = selectedAttendant?._id === att._id;
              const initials = getInitials(att.name);
              return (
                <button
                  key={att._id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`Staff member ${att.name}`}
                  onClick={() => handleAttendantChange(att)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border backdrop-blur-md transition-all duration-200 shrink-0 min-h-[44px] ${isSelected
                      ? 'bg-[rgba(44,34,30,0.88)] text-white border-white/20 shadow-md ring-2 ring-[#8C4A32]/40'
                      : 'bg-white/70 border-[rgba(232,226,217,0.65)] hover:border-[#D4A359] hover:bg-white/90 text-[#231F1D]'
                    }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border ${isSelected
                        ? 'border-white/30 bg-white/10 text-white'
                        : 'border-[rgba(232,226,217,0.8)] bg-brand-gray-50 text-[#231F1D]'
                      }`}
                  >
                    {initials}
                  </div>
                  <div className="text-left leading-tight pr-1">
                    <span className="text-xs font-bold block">{att.name}</span>
                    <span className={`text-[10px] block ${isSelected ? 'text-white/80' : 'text-[#6E655F]'}`}>
                      Certified
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3 Pagination / swipe indicator dots */}
        <div
          className="flex items-center justify-center gap-1.5 pt-1"
          role="navigation"
          aria-label="Staff carousel pagination"
        >
          {[0, 1, 2].map((idx) => {
            const isActive = staffScrollProgress === idx;
            return (
              <button
                key={idx}
                type="button"
                aria-label={`Staff page ${idx + 1}`}
                onClick={() => scrollToStaffSegment(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${isActive
                    ? 'w-4 bg-[#8C4A32] shadow-xs'
                    : 'w-1.5 bg-[#E0D7CC] hover:bg-[#C2B6A7]'
                  }`}
              />
            );
          })}
        </div>
      </section>

      {/* Month Calendar Grid */}
      <section aria-labelledby="calendar-heading" className="bg-white/75 backdrop-blur-md rounded-2xl border border-[rgba(232,226,217,0.65)] p-4 sm:p-5 shadow-soft space-y-4">
        {/* Month Header & Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon size={16} className="text-[#6E655F]" />
            <h2 id="calendar-heading" className="text-base font-serif font-black tracking-tight text-[#231F1D]">
              {monthTitle}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={isCurrentNairobiMonth}
              aria-label="Previous month"
              className="w-11 h-11 flex items-center justify-center rounded-lg border border-[rgba(232,226,217,0.65)] bg-white/60 hover:bg-white disabled:opacity-20 disabled:hover:border-[rgba(232,226,217,0.65)] transition-colors text-[#231F1D]"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="w-11 h-11 flex items-center justify-center rounded-lg border border-[rgba(232,226,217,0.65)] bg-white/60 hover:bg-white transition-colors text-[#231F1D]"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <span key={d} className="text-[11px] font-bold uppercase tracking-wider text-[#6E655F] py-1">
              {d}
            </span>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label="Month days">
          {calendarDays.map(item => {
            if (item.isBlank) {
              return <div key={item.key} className="aspect-square min-h-[44px]" aria-hidden="true" />;
            }

            const { dateStr, dayNum } = item;
            const isPast = dateStr < nairobiToday;
            const isToday = dateStr === nairobiToday;
            const isSelected = selectedDate === dateStr;
            const freeSlots = monthCounts[dateStr];
            const hasSlots = freeSlots !== undefined ? freeSlots > 0 : !isPast;
            const isDisabled = isPast || (!isLoadingMonthCounts && freeSlots !== undefined && freeSlots === 0);

            // Indicator bar color:
            // green for 10+, yellow for 6-10, orange for 1-5
            let indicatorBg = '';
            if (hasSlots && freeSlots !== undefined && freeSlots > 0) {
              if (freeSlots >= 10) indicatorBg = 'bg-[#10B981]'; // Green
              else if (freeSlots >= 6) indicatorBg = 'bg-[#F59E0B]'; // Yellow
              else indicatorBg = 'bg-[#F97316]'; // Orange
            }

            const ariaLabel = `${dayNum} ${monthTitle}${freeSlots !== undefined ? `, ${freeSlots} slots available` : ''
              }${isToday ? ', Today' : ''}`;

            return (
              <button
                key={item.key}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  onSelectDate(dateStr);
                  onSelectTime(null);
                }}
                aria-label={ariaLabel}
                aria-selected={isSelected}
                aria-disabled={isDisabled}
                className={`relative aspect-square min-h-[44px] min-w-[44px] rounded-xl flex flex-col items-center justify-center transition-all duration-200 border ${isDisabled
                    ? 'opacity-25 cursor-not-allowed text-[#6E655F]/60 bg-transparent border-transparent'
                    : isSelected
                      ? 'bg-[rgba(44,34,30,0.88)] text-white shadow-md font-bold ring-2 ring-[#8C4A32]/40 scale-[1.03] z-10 border-white/20'
                      : 'hover:bg-white/90 hover:border-[#D4A359] text-[#231F1D] font-semibold bg-white/60 border-[rgba(232,226,217,0.65)]'
                  }`}
              >
                <span className="text-sm leading-none font-medium">{dayNum}</span>

                {/* Capacity indicator bar under available days */}
                {!isDisabled && indicatorBg && (
                  <span
                    className={`mt-1 h-[3px] w-3.5 rounded-full ${indicatorBg} ${isSelected ? 'ring-1 ring-white/50' : ''
                      }`}
                    aria-hidden="true"
                  />
                )}
                {!isDisabled && !indicatorBg && !isLoadingMonthCounts && (
                  <span className="mt-1 h-[3px] w-3.5" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="pt-2 border-t border-[rgba(232,226,217,0.65)] flex items-center justify-between flex-wrap gap-2 text-[11px] text-[#6E655F] font-medium">
          <span>Available slots:</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-[3px] rounded-full bg-[#10B981]" aria-hidden="true" />
              <span>10+</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-[3px] rounded-full bg-[#F59E0B]" aria-hidden="true" />
              <span>6–10</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-[3px] rounded-full bg-[#F97316]" aria-hidden="true" />
              <span>1–5</span>
            </span>
          </div>
        </div>
      </section>

      {/* Time Slots Section */}
      <section aria-labelledby="slots-heading" className="space-y-4">
        <h2 id="slots-heading" className="sr-only">
          Available Appointment Times
        </h2>

        {/* Morning / Afternoon / Evening filter container matching calendar width with centered items */}
        <div className="w-full bg-white/60 backdrop-blur-md border border-[rgba(232,226,217,0.65)] p-1.5 rounded-2xl flex items-center justify-center">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 max-w-full overflow-x-auto scrollbar-hide">
            {(['all', 'morning', 'afternoon', 'evening'] as const).map(period => {
              const isActive = periodFilter === period;
              const labels = {
                all: 'All',
                morning: 'Morning',
                afternoon: 'Afternoon',
                evening: 'Evening',
              };
              return (
                <button
                  key={period}
                  type="button"
                  onClick={() => setPeriodFilter(period)}
                  aria-pressed={isActive}
                  className={`text-xs px-3.5 sm:px-4 py-2 rounded-xl font-bold capitalize transition-all min-h-[38px] text-center whitespace-nowrap ${isActive
                      ? 'bg-[rgba(44,34,30,0.88)] text-white shadow-sm'
                      : 'text-[#6E655F] hover:text-[#231F1D] hover:bg-white/70'
                    }`}
                >
                  {labels[period]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading Skeletons */}
        {isLoadingSlots ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-2 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-white/60 rounded-xl border border-[rgba(232,226,217,0.65)]" />
            ))}
          </div>
        ) : filteredTimeSlots.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-2" role="radiogroup" aria-label="Available appointment times">
            {filteredTimeSlots.map(time => {
              const isSelected = selectedTime === time;
              const timeDisplay = formatTime12(time);
              return (
                <button
                  key={time}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`Select time slot at ${timeDisplay}`}
                  onClick={() => onSelectTime(time)}
                  className={`min-h-[46px] px-3 py-2.5 rounded-xl border backdrop-blur-md text-xs font-black tracking-wider transition-all duration-200 flex items-center justify-center ${isSelected
                      ? 'bg-[rgba(44,34,30,0.88)] text-white border-white/20 shadow-md ring-2 ring-[#8C4A32]/40 scale-[1.02]'
                      : 'bg-white/75 border-[rgba(232,226,217,0.65)] hover:border-[#D4A359] text-[#231F1D]'
                    }`}
                >
                  {timeDisplay}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-[rgba(232,226,217,0.65)] p-6 text-center space-y-2">
            <Clock size={28} className="mx-auto text-[#6E655F] stroke-1" />
            <p className="text-sm font-serif italic text-[#231F1D]">
              No available slots for {formattedSelectedDate}
              {periodFilter !== 'all' ? ` in the ${periodFilter}` : ''}.
            </p>
            <p className="text-xs text-[#6E655F] max-w-xs mx-auto">
              Please choose another day on the calendar or try selecting &ldquo;Any professional&rdquo; to unlock more openings.
            </p>
          </div>
        )}

        {/* Schedule Preview for Multi-service bookings */}
        {selectedTime && multiSlotOptions.length > 0 && (
          <div className="bg-white/75 backdrop-blur-md border border-[rgba(232,226,217,0.65)] rounded-2xl p-4 space-y-2.5 mt-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#6E655F]">
              <span>Appointment Schedule Preview</span>
            </div>
            {(() => {
              const opt = multiSlotOptions.find(o => o.time === selectedTime);
              if (opt && opt.segments && opt.segments.length > 0) {
                return (
                  <div className="space-y-1.5">
                    {opt.segments.map((seg, idx) => {
                      const svc = selectedServices.find(s => s._id === seg.serviceId);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-1 border-b border-[rgba(232,226,217,0.5)] last:border-b-0"
                        >
                          <span className="font-semibold text-[#231F1D]">
                            {idx + 1}. {svc?.name} ({formatTime12(seg.startTime)} – {formatTime12(seg.endTime)})
                          </span>
                          <span className="text-[#6E655F] font-medium">with {seg.attendantName}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return (
                <p className="text-xs text-[#231F1D]">
                  Starts at <strong>{formatTime12(selectedTime)}</strong> ({totalDuration} min)
                </p>
              );
            })()}
          </div>
        )}
      </section>

      {/* Sticky Bottom Bar: Dark Espresso Glass with Terracotta Continue button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[rgba(44,34,30,0.88)] backdrop-blur-[16px] border-t border-white/12 shadow-2xl">
        <div className="max-w-md mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-between gap-4 text-white">
          <div className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-wider font-bold text-white/75">
              {selectedServices.length} {selectedServices.length === 1 ? 'service' : 'services'} • {formatDuration(totalDuration)}
            </p>
            <p className="text-base font-black tracking-tight text-white">
              KES {totalPrice.toLocaleString()}
            </p>
          </div>

          <button
            type="button"
            disabled={!selectedTime}
            onClick={onContinue}
            className="min-h-[46px] px-7 bg-[#8C4A32] text-white font-bold text-xs uppercase tracking-[0.2em] rounded-xl transition-all disabled:opacity-30 hover:bg-[#783E2A] hover:tracking-[0.25em] active:scale-[0.98] shadow-lg shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
