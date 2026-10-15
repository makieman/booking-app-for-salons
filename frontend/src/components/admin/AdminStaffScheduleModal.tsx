import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Coffee,
  Plus,
  Trash2,
  X,
  Check,
  Loader2,
  AlertCircle,
  CalendarX,
  Sparkles,
} from 'lucide-react';
import { Attendant, AttendantDaySchedule, AttendantBreak } from '../../types';
import * as api from '../../api/client';

interface AdminStaffScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  attendant: Attendant | null;
  ownerPin: string;
  onSaved: (updated: Attendant) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

const DAYS_OF_WEEK = [
  { dayOfWeek: 1, label: 'Monday', short: 'Mon' },
  { dayOfWeek: 2, label: 'Tuesday', short: 'Tue' },
  { dayOfWeek: 3, label: 'Wednesday', short: 'Wed' },
  { dayOfWeek: 4, label: 'Thursday', short: 'Thu' },
  { dayOfWeek: 5, label: 'Friday', short: 'Fri' },
  { dayOfWeek: 6, label: 'Saturday', short: 'Sat' },
  { dayOfWeek: 0, label: 'Sunday', short: 'Sun' },
];

function getDefaultSchedule(): AttendantDaySchedule[] {
  return [
    { dayOfWeek: 1, isWorkingDay: true, start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', label: 'Lunch' }] },
    { dayOfWeek: 2, isWorkingDay: true, start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', label: 'Lunch' }] },
    { dayOfWeek: 3, isWorkingDay: true, start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', label: 'Lunch' }] },
    { dayOfWeek: 4, isWorkingDay: true, start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', label: 'Lunch' }] },
    { dayOfWeek: 5, isWorkingDay: true, start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', label: 'Lunch' }] },
    { dayOfWeek: 6, isWorkingDay: true, start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', label: 'Lunch' }] },
    { dayOfWeek: 0, isWorkingDay: false, start: '09:00', end: '18:00', breaks: [] },
  ];
}

export function AdminStaffScheduleModal({
  isOpen,
  onClose,
  attendant,
  ownerPin,
  onSaved,
  triggerToast,
}: AdminStaffScheduleModalProps) {
  if (!isOpen || !attendant) return null;

  // Initialize schedule with existing attendant schedule or default standard schedule
  const [schedule, setSchedule] = useState<AttendantDaySchedule[]>(() => {
    if (attendant.schedule && attendant.schedule.length > 0) {
      // Ensure all 7 days exist
      return DAYS_OF_WEEK.map(({ dayOfWeek }) => {
        const existing = attendant.schedule!.find(s => s.dayOfWeek === dayOfWeek);
        if (existing) return { ...existing, breaks: existing.breaks || [] };
        return {
          dayOfWeek,
          isWorkingDay: dayOfWeek !== 0,
          start: '09:00',
          end: '18:00',
          breaks: dayOfWeek !== 0 ? [{ start: '13:00', end: '14:00', label: 'Lunch' }] : [],
        };
      });
    }
    return getDefaultSchedule();
  });

  const [daysOff, setDaysOff] = useState<string[]>(() => [...(attendant.daysOff || [])].sort());
  const [newDayOff, setNewDayOff] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle day working status
  const toggleWorkingDay = (dayOfWeek: number) => {
    setSchedule(prev =>
      prev.map(d =>
        d.dayOfWeek === dayOfWeek ? { ...d, isWorkingDay: !d.isWorkingDay } : d
      )
    );
  };

  // Update day shift times
  const updateDayTimes = (dayOfWeek: number, field: 'start' | 'end', val: string) => {
    setSchedule(prev =>
      prev.map(d => (d.dayOfWeek === dayOfWeek ? { ...d, [field]: val } : d))
    );
  };

  // Add break to a day
  const addBreak = (dayOfWeek: number) => {
    setSchedule(prev =>
      prev.map(d => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const currentBreaks = d.breaks || [];
        return {
          ...d,
          breaks: [
            ...currentBreaks,
            { start: '13:00', end: '14:00', label: 'Break' },
          ],
        };
      })
    );
  };

  // Remove break from a day
  const removeBreak = (dayOfWeek: number, index: number) => {
    setSchedule(prev =>
      prev.map(d => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const newBreaks = [...(d.breaks || [])];
        newBreaks.splice(index, 1);
        return { ...d, breaks: newBreaks };
      })
    );
  };

  // Update break details
  const updateBreak = (
    dayOfWeek: number,
    index: number,
    field: keyof AttendantBreak,
    val: string
  ) => {
    setSchedule(prev =>
      prev.map(d => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const newBreaks = [...(d.breaks || [])];
        newBreaks[index] = { ...newBreaks[index], [field]: val };
        return { ...d, breaks: newBreaks };
      })
    );
  };

  // Add a specific day off
  const handleAddDayOff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDayOff) return;
    if (daysOff.includes(newDayOff)) {
      triggerToast('That date is already added to days off', 'error');
      return;
    }
    setDaysOff(prev => [...prev, newDayOff].sort());
    setNewDayOff('');
  };

  // Remove a specific day off
  const handleRemoveDayOff = (dateToRemove: string) => {
    setDaysOff(prev => prev.filter(d => d !== dateToRemove));
  };

  // Reset to default standard schedule
  const handleApplyDefaults = () => {
    setSchedule(getDefaultSchedule());
    triggerToast('Applied default salon hours (Mon-Sat 09:00–18:00)', 'success');
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateAttendant(ownerPin, attendant._id, {
        schedule,
        daysOff,
      });
      onSaved(updated);
      triggerToast(`${attendant.name}'s schedule & availability saved!`, 'success');
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update attendant schedule');
      triggerToast(err.message || 'Failed to update schedule', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-brand-gray-200 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-brand-gray-100 flex items-center justify-between shrink-0 bg-brand-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-black text-white flex items-center justify-center font-bold text-sm shrink-0">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="font-serif font-black text-lg text-brand-black leading-tight">
                Staff Availability & Shifts
              </h2>
              <p className="text-xs text-brand-gray-500 font-medium">
                {attendant.name}{' '}
                {attendant.username && (
                  <span className="font-mono text-brand-gray-400">(@{attendant.username})</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-brand-gray-400 hover:text-brand-black hover:bg-white rounded-xl border border-transparent hover:border-brand-gray-200 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-brand-black">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex items-center justify-between bg-brand-gray-50 p-3.5 rounded-2xl border border-brand-gray-200/70">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-black">Weekly Schedule</p>
              <p className="text-[11px] text-brand-gray-500">Configure shifts and recurring daily breaks</p>
            </div>
            <button
              type="button"
              onClick={handleApplyDefaults}
              className="px-3 py-1.5 bg-white hover:bg-brand-gray-100 text-brand-black border border-brand-gray-200 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles size={12} className="text-brand-black" />
              <span>Reset Standard</span>
            </button>
          </div>

          {/* Weekly Days List */}
          <div className="space-y-3">
            {DAYS_OF_WEEK.map(({ dayOfWeek, label, short }) => {
              const day = schedule.find(s => s.dayOfWeek === dayOfWeek) || {
                dayOfWeek,
                isWorkingDay: false,
                start: '09:00',
                end: '18:00',
                breaks: [],
              };

              return (
                <div
                  key={dayOfWeek}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    day.isWorkingDay
                      ? 'bg-white border-brand-gray-200 shadow-2xs'
                      : 'bg-brand-gray-50/70 border-brand-gray-200/50 opacity-75'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleWorkingDay(dayOfWeek)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                          day.isWorkingDay
                            ? 'bg-brand-black text-white'
                            : 'border border-brand-gray-300 bg-white text-transparent hover:border-brand-black'
                        }`}
                      >
                        <Check size={14} strokeWidth={3} />
                      </button>
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-black">
                          {label}
                        </span>
                        <span
                          className={`ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            day.isWorkingDay
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-brand-gray-200/70 text-brand-gray-600'
                          }`}
                        >
                          {day.isWorkingDay ? 'Working' : 'Day Off'}
                        </span>
                      </div>
                    </div>

                    {day.isWorkingDay && (
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <div className="flex items-center gap-1.5 bg-brand-gray-50 px-2.5 py-1.5 rounded-xl border border-brand-gray-200">
                          <Clock size={12} className="text-brand-gray-400" />
                          <input
                            type="time"
                            value={day.start}
                            onChange={e => updateDayTimes(dayOfWeek, 'start', e.target.value)}
                            className="bg-transparent text-xs font-bold text-brand-black focus:outline-none"
                          />
                          <span className="text-xs text-brand-gray-400 font-bold">–</span>
                          <input
                            type="time"
                            value={day.end}
                            onChange={e => updateDayTimes(dayOfWeek, 'end', e.target.value)}
                            className="bg-transparent text-xs font-bold text-brand-black focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => addBreak(dayOfWeek)}
                          className="px-2.5 py-1.5 bg-brand-gray-100 hover:bg-brand-gray-200 text-brand-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1"
                          title="Add Break"
                        >
                          <Coffee size={12} />
                          <span>+ Break</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Breaks List for this day */}
                  {day.isWorkingDay && (day.breaks || []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-brand-gray-100 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
                        Scheduled Breaks
                      </p>
                      <div className="space-y-1.5">
                        {day.breaks!.map((brk, bIdx) => (
                          <div
                            key={bIdx}
                            className="flex items-center justify-between gap-2 bg-brand-gray-50/70 px-3 py-1.5 rounded-xl border border-brand-gray-200/60"
                          >
                            <div className="flex items-center gap-2">
                              <Coffee size={12} className="text-brand-gray-400" />
                              <input
                                type="text"
                                value={brk.label || 'Break'}
                                onChange={e => updateBreak(dayOfWeek, bIdx, 'label', e.target.value)}
                                placeholder="Break label"
                                className="text-xs font-semibold text-brand-black bg-transparent w-24 sm:w-32 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                value={brk.start}
                                onChange={e => updateBreak(dayOfWeek, bIdx, 'start', e.target.value)}
                                className="bg-white border border-brand-gray-200 rounded-lg px-2 py-0.5 text-xs font-bold focus:outline-none"
                              />
                              <span className="text-xs text-brand-gray-400">–</span>
                              <input
                                type="time"
                                value={brk.end}
                                onChange={e => updateBreak(dayOfWeek, bIdx, 'end', e.target.value)}
                                className="bg-white border border-brand-gray-200 rounded-lg px-2 py-0.5 text-xs font-bold focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => removeBreak(dayOfWeek, bIdx)}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                                title="Remove break"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Specific Days Off (Vacations / Leave) */}
          <div className="bg-white border border-brand-gray-200 rounded-2xl p-4 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <CalendarX size={16} className="text-brand-black" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-black">Specific Days Off / Leave</p>
                <p className="text-[11px] text-brand-gray-500">Block full-day availability for holidays, sick leave, or vacations</p>
              </div>
            </div>

            <form onSubmit={handleAddDayOff} className="flex items-center gap-2">
              <input
                type="date"
                value={newDayOff}
                onChange={e => setNewDayOff(e.target.value)}
                className="border border-brand-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-brand-black focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newDayOff}
                className="px-3.5 py-2 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>Add Day Off</span>
              </button>
            </form>

            {daysOff.length === 0 ? (
              <p className="text-xs text-brand-gray-400 italic pt-1">No specific days off scheduled.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {daysOff.map(dateStr => (
                  <div
                    key={dateStr}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold"
                  >
                    <span>{dateStr}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDayOff(dateStr)}
                      className="p-0.5 hover:bg-red-200/60 rounded-md transition-all text-red-700"
                      title="Remove day off"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-brand-gray-100 flex items-center justify-end gap-3 shrink-0 bg-brand-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-brand-gray-200 hover:border-brand-black text-brand-gray-600 hover:text-brand-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-5 py-2.5 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 shadow-xs"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin text-white" />
            ) : (
              <Check size={14} strokeWidth={2.5} />
            )}
            <span>Save Availability</span>
          </button>
        </div>
      </div>
    </div>
  );
}
