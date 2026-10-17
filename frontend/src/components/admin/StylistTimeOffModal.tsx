import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, Save, AlertCircle, Check } from 'lucide-react';
import { Attendant, TimeOffEntry } from '../../types';
import * as api from '../../api/client';

interface StylistTimeOffModalProps {
  isOpen: boolean;
  onClose: () => void;
  attendant: Attendant | null;
  ownerPin: string;
  onSaved: (updated: Attendant) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function validateEntries(entries: TimeOffEntry[]): string | null {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.date) return `Entry ${i + 1}: date is required.`;
    if (!e.allDay) {
      if (!e.startTime || !e.endTime)
        return `Entry ${i + 1}: start and end times are required for a partial-day entry.`;
      if (timeToMins(e.startTime) >= timeToMins(e.endTime))
        return `Entry ${i + 1}: start time must be before end time.`;
    }
  }

  // Check for duplicates/overlaps on the same date
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (a.date === b.date) {
        if (a.allDay || b.allDay) {
          return `Entries ${i + 1} and ${j + 1} conflict (both apply to ${a.date}).`;
        }
        const as = timeToMins(a.startTime!);
        const ae = timeToMins(a.endTime!);
        const bs = timeToMins(b.startTime!);
        const be = timeToMins(b.endTime!);
        if (as < be && ae > bs) {
          return `Entries ${i + 1} and ${j + 1} on ${a.date} overlap in time.`;
        }
      }
    }
  }

  return null;
}

export function StylistTimeOffModal({
  isOpen,
  onClose,
  attendant,
  ownerPin,
  onSaved,
  triggerToast,
}: StylistTimeOffModalProps) {
  const [entries, setEntries] = useState<TimeOffEntry[]>(() => {
    if (!attendant) return [];
    const existing: TimeOffEntry[] = attendant.timeOff ? [...attendant.timeOff] : [];
    // Also import legacy daysOff as all-day entries (de-duped)
    (attendant.daysOff || []).forEach(d => {
      if (!existing.some(e => e.date === d && e.allDay)) {
        existing.push({ date: d, allDay: true });
      }
    });
    return existing.sort((a, b) => a.date.localeCompare(b.date));
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attendant) return;
    const existing: TimeOffEntry[] = attendant.timeOff ? [...attendant.timeOff] : [];
    (attendant.daysOff || []).forEach(d => {
      if (!existing.some(e => e.date === d && e.allDay)) {
        existing.push({ date: d, allDay: true });
      }
    });
    setEntries(existing.sort((a, b) => a.date.localeCompare(b.date)));
    setError(null);
  }, [attendant]);

  if (!isOpen || !attendant) return null;

  const handleAdd = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEntries(prev => [...prev, { date: today, allDay: true }]);
  };

  const handleRemove = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const handleChange = <K extends keyof TimeOffEntry>(idx: number, field: K, value: TimeOffEntry[K]) => {
    setEntries(prev =>
      prev.map((e, i) =>
        i === idx
          ? field === 'allDay' && value === true
            ? { ...e, allDay: true, startTime: undefined, endTime: undefined }
            : { ...e, [field]: value }
          : e
      )
    );
  };

  const handleSave = async () => {
    setError(null);
    const err = validateEntries(entries);
    if (err) {
      setError(err);
      return;
    }

    setSaving(true);
    try {
      // Derive daysOff from all-day entries for backward-compat
      const daysOff = entries.filter(e => e.allDay).map(e => e.date);
      const updated = await api.updateAttendant(ownerPin, attendant._id, {
        timeOff: entries,
        daysOff,
      });
      onSaved(updated);
      triggerToast(`Time off saved for ${attendant.name}.`, 'success');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save time off.');
      triggerToast(err.message || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-off-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-gray-100 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
              Stylist time off
            </p>
            <h2
              id="time-off-modal-title"
              className="text-lg font-serif font-bold text-brand-black leading-tight mt-0.5"
            >
              {attendant.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close time off modal"
            className="p-2 hover:bg-brand-gray-100 rounded-xl transition-colors text-brand-gray-500 hover:text-brand-black"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-start gap-2"
            >
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-brand-gray-500">
            Add whole-day or partial-day time off. Slots that fall within a time-off window
            will be blocked for this stylist.
          </p>

          {entries.length === 0 ? (
            <p className="text-xs text-brand-gray-400 italic py-2">No time off scheduled.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, idx) => (
                <div
                  key={idx}
                  className="p-3 border border-brand-gray-200 rounded-xl bg-brand-gray-50/40 space-y-2.5"
                >
                  {/* Row 1: date, type toggle, delete */}
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="space-y-0.5 flex-1 min-w-[140px]">
                      <label
                        htmlFor={`toff-date-${idx}`}
                        className="text-[11px] font-medium text-brand-gray-500 block"
                      >
                        Date
                      </label>
                      <input
                        id={`toff-date-${idx}`}
                        type="date"
                        value={entry.date}
                        onChange={e => handleChange(idx, 'date', e.target.value)}
                        className="w-full border border-brand-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:border-brand-black focus:outline-none"
                      />
                    </div>

                    {/* All-day toggle */}
                    <fieldset className="space-y-0.5">
                      <legend className="text-[11px] font-medium text-brand-gray-500">Type</legend>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-pressed={entry.allDay}
                          onClick={() => handleChange(idx, 'allDay', true)}
                          className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                            entry.allDay
                              ? 'bg-brand-black text-white border-brand-black'
                              : 'bg-white text-brand-gray-600 border-brand-gray-200 hover:border-brand-gray-400'
                          }`}
                        >
                          All day
                        </button>
                        <button
                          type="button"
                          aria-pressed={!entry.allDay}
                          onClick={() => handleChange(idx, 'allDay', false)}
                          className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                            !entry.allDay
                              ? 'bg-brand-black text-white border-brand-black'
                              : 'bg-white text-brand-gray-600 border-brand-gray-200 hover:border-brand-gray-400'
                          }`}
                        >
                          Time range
                        </button>
                      </div>
                    </fieldset>

                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      aria-label={`Remove entry ${idx + 1}`}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all self-end"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Row 2: time range inputs (only if not all-day) */}
                  {!entry.allDay && (
                    <div className="flex items-end gap-3 flex-wrap">
                      <div className="space-y-0.5">
                        <label
                          htmlFor={`toff-start-${idx}`}
                          className="text-[11px] font-medium text-brand-gray-500 block"
                        >
                          From
                        </label>
                        <input
                          id={`toff-start-${idx}`}
                          type="time"
                          value={entry.startTime || '09:00'}
                          onChange={e => handleChange(idx, 'startTime', e.target.value)}
                          className="border border-brand-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:border-brand-black focus:outline-none"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label
                          htmlFor={`toff-end-${idx}`}
                          className="text-[11px] font-medium text-brand-gray-500 block"
                        >
                          Until
                        </label>
                        <input
                          id={`toff-end-${idx}`}
                          type="time"
                          value={entry.endTime || '17:00'}
                          onChange={e => handleChange(idx, 'endTime', e.target.value)}
                          className="border border-brand-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:border-brand-black focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Optional note */}
                  <div className="space-y-0.5">
                    <label
                      htmlFor={`toff-note-${idx}`}
                      className="text-[11px] font-medium text-brand-gray-500 block"
                    >
                      Note <span className="font-normal text-brand-gray-400">(optional)</span>
                    </label>
                    <input
                      id={`toff-note-${idx}`}
                      type="text"
                      placeholder="e.g. Medical appointment"
                      value={entry.note || ''}
                      onChange={e => handleChange(idx, 'note', e.target.value)}
                      className="w-full border border-brand-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-brand-black focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border border-brand-gray-200 rounded-xl hover:border-brand-black transition-all"
          >
            <Plus size={13} />
            Add entry
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-brand-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-brand-gray-200 text-brand-gray-600 hover:text-brand-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            <span>Save time off</span>
          </button>
        </div>
      </div>
    </div>
  );
}
