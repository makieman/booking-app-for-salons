import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Plus, Trash2, Loader2, Save, Check, AlertCircle, X } from 'lucide-react';
import { Tenant, TenantScheduleBreak } from '../../types';
import * as api from '../../api/client';

interface ScheduleSettingsProps {
  tenant: Tenant | null;
  ownerToken: string;
  onTenantUpdated: (tenant: Tenant) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Validation helpers ─────────────────────────────────────────────────────────

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function validateBreaks(
  breaks: TenantScheduleBreak[],
  workStart: string,
  workEnd: string
): string | null {
  const wsm = timeToMins(workStart);
  const wem = timeToMins(workEnd);

  for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i];
    if (!b.label.trim()) return `Break ${i + 1}: label is required.`;
    if (!b.start || !b.end) return `Break ${i + 1}: start and end time are required.`;

    const bs = timeToMins(b.start);
    const be = timeToMins(b.end);
    if (bs >= be) return `Break ${i + 1}: start must be before end.`;
    if (bs < wsm || be > wem)
      return `Break ${i + 1}: must fall within working hours (${workStart}–${workEnd}).`;

    // Check for overlap with other breaks
    for (let j = i + 1; j < breaks.length; j++) {
      const other = breaks[j];
      const os = timeToMins(other.start);
      const oe = timeToMins(other.end);
      if (bs < oe && be > os) {
        return `Breaks ${i + 1} and ${j + 1} overlap.`;
      }
    }
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScheduleSettings({
  tenant,
  ownerToken,
  onTenantUpdated,
  triggerToast,
}: ScheduleSettingsProps) {
  // Working hours
  const [workStart, setWorkStart] = useState(tenant?.workingHours?.start || '09:00');
  const [workEnd, setWorkEnd] = useState(tenant?.workingHours?.end || '18:00');

  // Booking engine
  const [slotInterval, setSlotInterval] = useState<number>(tenant?.bookingRules?.slotInterval || 30);
  const [minNoticeHours, setMinNoticeHours] = useState<number>(
    tenant?.bookingRules?.minNoticeHours ?? 2
  );

  // Breaks
  const [breaks, setBreaks] = useState<TenantScheduleBreak[]>(
    tenant?.bookingRules?.breaks || []
  );

  // Closed weekdays
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>(
    tenant?.bookingRules?.closedWeekdays || []
  );

  // Closed dates / holidays
  const [holidays, setHolidays] = useState<string[]>(tenant?.bookingRules?.holidays || []);
  const [newHoliday, setNewHoliday] = useState('');

  // Status
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync if tenant prop refreshes from above
  useEffect(() => {
    if (!tenant) return;
    setWorkStart(tenant.workingHours?.start || '09:00');
    setWorkEnd(tenant.workingHours?.end || '18:00');
    setSlotInterval(tenant.bookingRules?.slotInterval || 30);
    setMinNoticeHours(tenant.bookingRules?.minNoticeHours ?? 2);
    setBreaks(tenant.bookingRules?.breaks || []);
    setClosedWeekdays(tenant.bookingRules?.closedWeekdays || []);
    setHolidays(tenant.bookingRules?.holidays || []);
  }, [tenant]);

  // ── Breaks helpers ─────────────────────────────────────────────────────────

  const handleAddBreak = () => {
    setBreaks(prev => [...prev, { label: '', start: '12:00', end: '13:00' }]);
  };

  const handleRemoveBreak = (idx: number) => {
    setBreaks(prev => prev.filter((_, i) => i !== idx));
  };

  const handleBreakChange = (
    idx: number,
    field: keyof TenantScheduleBreak,
    value: string
  ) => {
    setBreaks(prev => prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  };

  // ── Weekday toggle ─────────────────────────────────────────────────────────

  const toggleWeekday = (day: number) => {
    setClosedWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // ── Holiday helpers ────────────────────────────────────────────────────────

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday) return;
    if (holidays.includes(newHoliday)) {
      triggerToast('That date is already in the list.', 'error');
      return;
    }
    setHolidays(prev => [...prev, newHoliday].sort());
    setNewHoliday('');
  };

  const handleRemoveHoliday = (d: string) => {
    setHolidays(prev => prev.filter(h => h !== d));
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    // Client-side validation
    if (!workStart || !workEnd) {
      setError('Working hours are required.');
      return;
    }
    if (timeToMins(workStart) >= timeToMins(workEnd)) {
      setError('Opening time must be before closing time.');
      return;
    }
    const breakErr = validateBreaks(breaks, workStart, workEnd);
    if (breakErr) {
      setError(breakErr);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateTenantSettings(ownerToken, {
        workingHours: { start: workStart, end: workEnd },
        bookingRules: {
          slotInterval: Number(slotInterval),
          bufferMinutes: tenant?.bookingRules?.bufferMinutes ?? 0,
          minNoticeHours: Number(minNoticeHours),
          holidays,
          closedWeekdays,
          breaks: breaks.map(b => ({
            label: b.label.trim(),
            start: b.start,
            end: b.end,
          })),
        },
      });
      onTenantUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      triggerToast('Schedule settings saved.', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to save schedule settings.');
      triggerToast(err.message || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-brand-gray-100 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
            Schedule settings
          </p>
          <p className="text-[11px] text-brand-gray-400 mt-0.5">
            Working hours, breaks, closed days, and booking engine rules
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-label="Save schedule settings"
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shadow-xs cursor-pointer"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved ? (
            <Check size={13} />
          ) : (
            <Save size={13} />
          )}
          <span>{saved ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-start gap-2"
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* ── Working hours ────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 flex items-center gap-1.5">
            <Clock size={12} className="text-brand-gray-400" />
            Default working hours
          </label>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-0.5">
              <label htmlFor="sched-work-start" className="text-[11px] text-brand-gray-500 font-medium">
                Opens
              </label>
              <input
                id="sched-work-start"
                type="time"
                value={workStart}
                onChange={e => setWorkStart(e.target.value)}
                required
                className="block border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
              />
            </div>
            <span className="text-xs font-bold text-brand-gray-400 pb-2">to</span>
            <div className="space-y-0.5">
              <label htmlFor="sched-work-end" className="text-[11px] text-brand-gray-500 font-medium">
                Closes
              </label>
              <input
                id="sched-work-end"
                type="time"
                value={workEnd}
                onChange={e => setWorkEnd(e.target.value)}
                required
                className="block border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* ── Slot interval & min notice ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="sched-slot-interval" className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
              Slot step interval
            </label>
            <select
              id="sched-slot-interval"
              value={slotInterval}
              onChange={e => setSlotInterval(Number(e.target.value))}
              className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none bg-white cursor-pointer"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes (standard)</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes (hourly)</option>
            </select>
            <p className="text-[11px] text-brand-gray-400">
              Frequency of selectable booking start times
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="sched-min-notice" className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
              Minimum advance notice
            </label>
            <select
              id="sched-min-notice"
              value={minNoticeHours}
              onChange={e => setMinNoticeHours(Number(e.target.value))}
              className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none bg-white cursor-pointer"
            >
              <option value={0}>No minimum (instant)</option>
              <option value={1}>1 hour</option>
              <option value={2}>2 hours (suggested)</option>
              <option value={4}>4 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
            </select>
            <p className="text-[11px] text-brand-gray-400">
              Prevents last-minute bookings without preparation time
            </p>
          </div>
        </div>

        {/* ── Salon breaks ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                Salon-wide breaks
              </label>
              <p className="text-[11px] text-brand-gray-400 mt-0.5">
                No bookings are taken during these windows. Times must fall within working hours.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddBreak}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider border border-brand-gray-200 rounded-lg hover:border-brand-black transition-all shrink-0 ml-3"
            >
              <Plus size={12} />
              Add break
            </button>
          </div>

          {breaks.length === 0 ? (
            <p className="text-xs text-brand-gray-400 italic py-1">
              No salon-wide breaks configured.
            </p>
          ) : (
            <div className="space-y-2.5">
              {breaks.map((b, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap gap-2 items-end p-3 bg-brand-gray-50/60 border border-brand-gray-200 rounded-xl"
                >
                  {/* Label */}
                  <div className="space-y-0.5 flex-1 min-w-[120px]">
                    <label
                      htmlFor={`break-label-${idx}`}
                      className="text-[11px] text-brand-gray-500 font-medium block"
                    >
                      Label
                    </label>
                    <input
                      id={`break-label-${idx}`}
                      type="text"
                      placeholder="e.g. Lunch"
                      value={b.label}
                      onChange={e => handleBreakChange(idx, 'label', e.target.value)}
                      className="w-full border border-brand-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:border-brand-black focus:outline-none"
                    />
                  </div>

                  {/* Start */}
                  <div className="space-y-0.5">
                    <label
                      htmlFor={`break-start-${idx}`}
                      className="text-[11px] text-brand-gray-500 font-medium block"
                    >
                      Start
                    </label>
                    <input
                      id={`break-start-${idx}`}
                      type="time"
                      value={b.start}
                      onChange={e => handleBreakChange(idx, 'start', e.target.value)}
                      className="border border-brand-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:border-brand-black focus:outline-none"
                    />
                  </div>

                  {/* End */}
                  <div className="space-y-0.5">
                    <label
                      htmlFor={`break-end-${idx}`}
                      className="text-[11px] text-brand-gray-500 font-medium block"
                    >
                      End
                    </label>
                    <input
                      id={`break-end-${idx}`}
                      type="time"
                      value={b.end}
                      onChange={e => handleBreakChange(idx, 'end', e.target.value)}
                      className="border border-brand-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:border-brand-black focus:outline-none"
                    />
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => handleRemoveBreak(idx)}
                    aria-label={`Remove break ${idx + 1}`}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Closed weekdays ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 flex items-center gap-1.5">
            <Calendar size={12} className="text-brand-gray-400" />
            Closed on these weekdays
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Select closed weekdays">
            {DAY_NAMES.map((name, idx) => {
              const closed = closedWeekdays.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  aria-pressed={closed}
                  onClick={() => toggleWeekday(idx)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl border transition-all ${
                    closed
                      ? 'bg-brand-black text-white border-brand-black'
                      : 'bg-white text-brand-gray-600 border-brand-gray-200 hover:border-brand-black hover:text-brand-black'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {closedWeekdays.length > 0 && (
            <p className="text-[11px] text-brand-gray-400">
              Closed on: {closedWeekdays.slice().sort().map(d => DAY_NAMES[d]).join(', ')}
            </p>
          )}
        </div>

        {/* ── Closed dates / holidays ──────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
            Closed dates and holidays
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={newHoliday}
              onChange={e => setNewHoliday(e.target.value)}
              aria-label="Select a closed date"
              className="border border-brand-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-brand-black focus:outline-none"
            />
            <button
              type="button"
              disabled={!newHoliday}
              onClick={handleAddHoliday as any}
              className="px-3.5 py-2 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5"
            >
              <Plus size={13} />
              Add date
            </button>
          </div>

          {holidays.length === 0 ? (
            <p className="text-xs text-brand-gray-400 italic">
              No closed dates scheduled. Salon is open year-round.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {holidays.map(d => (
                <div
                  key={d}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold"
                >
                  <span>{d}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHoliday(d)}
                    aria-label={`Remove closed date ${d}`}
                    className="p-0.5 hover:bg-red-200/60 rounded-md transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
