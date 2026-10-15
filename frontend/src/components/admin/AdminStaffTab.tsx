import React, { useState } from 'react';
import { Users, UserPlus, Search, X, Check, Eye, EyeOff, Loader2, AlertCircle, Trash2, Key, Calendar } from 'lucide-react';
import { Attendant, Service } from '../../types';
import { formatPrice } from '../../utils/formatters';
import * as api from '../../api/client';
import { AdminStaffScheduleModal } from './AdminStaffScheduleModal';

interface AdminStaffTabProps {
  attendants: Attendant[];
  services: Service[];
  loading: boolean;
  ownerPin: string;
  onAttendantsUpdated: (attendants: Attendant[]) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminStaffTab({
  attendants,
  services,
  loading,
  ownerPin,
  onAttendantsUpdated,
  triggerToast,
}: AdminStaffTabProps) {
  // New staff form state
  const [staffForm, setStaffForm] = useState({
    name: '',
    username: '',
    pin: '',
    serviceIds: [] as string[],
  });
  const [showStaffPin, setShowStaffPin] = useState(false);
  const [staffAddLoading, setStaffAddLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [addStaffSearchQuery, setAddStaffSearchQuery] = useState('');

  // Edit staff state
  const [editingAttendantId, setEditingAttendantId] = useState<string | null>(null);
  const [editStaffForm, setEditStaffForm] = useState({
    name: '',
    pin: '',
    serviceIds: [] as string[],
  });
  const [showEditStaffPin, setShowEditStaffPin] = useState(false);
  const [editStaffSaving, setEditStaffSaving] = useState(false);
  const [editStaffError, setEditStaffError] = useState<string | null>(null);
  const [editStaffSearchQuery, setEditStaffSearchQuery] = useState('');

  // Staff Schedule & Availability modal state
  const [schedulingAttendant, setSchedulingAttendant] = useState<Attendant | null>(null);

  // Handle Add Staff
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name.trim() || !staffForm.username.trim() || staffForm.pin.length < 4) return;

    setStaffAddLoading(true);
    setStaffError(null);
    try {
      const created = await api.createAttendant(ownerPin, {
        name: staffForm.name.trim(),
        username: staffForm.username.trim().toLowerCase(),
        pin: staffForm.pin,
        serviceIds: staffForm.serviceIds,
      });

      onAttendantsUpdated([...attendants, created]);
      setStaffForm({ name: '', username: '', pin: '', serviceIds: [] });
      setAddStaffSearchQuery('');
      triggerToast('Staff account created successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      setStaffError(err.message || 'Failed to create staff account');
      triggerToast(err.message || 'Failed to create staff account', 'error');
    } finally {
      setStaffAddLoading(false);
    }
  };

  // Handle Edit Staff
  const handleSaveEditStaff = async (attendantId: string) => {
    if (!editStaffForm.name.trim()) return;
    if (editStaffForm.pin && (editStaffForm.pin.length < 4 || editStaffForm.pin.length > 6)) {
      setEditStaffError('PIN must be 4–6 digits');
      return;
    }

    setEditStaffSaving(true);
    setEditStaffError(null);
    try {
      const payload: any = {
        name: editStaffForm.name.trim(),
        serviceIds: editStaffForm.serviceIds,
      };
      if (editStaffForm.pin) {
        payload.pin = editStaffForm.pin;
      }

      const updated = await api.updateAttendant(ownerPin, attendantId, payload);
      onAttendantsUpdated(attendants.map(a => (a._id === attendantId ? updated : a)));
      setEditingAttendantId(null);
      triggerToast('Staff member updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      setEditStaffError(err.message || 'Failed to update staff member');
      triggerToast(err.message || 'Failed to update staff member', 'error');
    } finally {
      setEditStaffSaving(false);
    }
  };

  // Handle Toggle Active
  const handleToggleActive = async (attendant: Attendant) => {
    try {
      const updated = await api.updateAttendant(ownerPin, attendant._id, {
        isActive: !attendant.isActive,
      });
      onAttendantsUpdated(attendants.map(a => (a._id === attendant._id ? updated : a)));
      triggerToast(
        `Staff member ${updated.isActive ? 'activated' : 'deactivated'} successfully!`,
        'success'
      );
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Failed to update staff status', 'error');
    }
  };

  // Handle Delete Staff
  const handleDeleteStaff = async (attendant: Attendant) => {
    if (!window.confirm(`Are you sure you want to delete ${attendant.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.deleteAttendant(ownerPin, attendant._id);
      onAttendantsUpdated(attendants.filter(a => a._id !== attendant._id));
      triggerToast('Staff member deleted successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Failed to delete staff member', 'error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-brand-gray-100 pb-4">
        <h2 className="text-2xl font-serif font-black uppercase text-brand-black">Team & Stylists</h2>
        <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-400 mt-1">
          Manage staff members, access credentials, and qualified services
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Attendants List (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
            Staff Members ({attendants.length})
          </p>

          {loading ? (
            <div className="p-16 text-center border border-brand-gray-100 bg-white rounded-2xl flex items-center justify-center gap-2 text-brand-gray-500 font-medium text-sm">
              <Loader2 size={16} className="animate-spin text-brand-black" />
              <span>Loading staff accounts...</span>
            </div>
          ) : attendants.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-brand-gray-100 bg-white rounded-2xl text-brand-gray-400">
              <p className="font-serif italic text-base">No staff accounts registered yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {attendants.map(a => {
                const isEditing = editingAttendantId === a._id;

                if (isEditing) {
                  return (
                    <div
                      key={a._id}
                      className="p-5 bg-white border-2 border-brand-black rounded-2xl shadow-sm space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-brand-gray-100 pb-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-black flex items-center gap-1.5">
                          <Users size={14} />
                          <span>Editing {a.name}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingAttendantId(null)}
                          className="text-brand-gray-400 hover:text-brand-black"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {editStaffError && (
                        <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-2">
                          <AlertCircle size={13} />
                          <span>{editStaffError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                            Display Name
                          </label>
                          <input
                            type="text"
                            required
                            value={editStaffForm.name}
                            onChange={e => setEditStaffForm(p => ({ ...p, name: e.target.value }))}
                            className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                            New PIN <span className="text-brand-gray-400 font-normal lowercase">(leave blank to keep)</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showEditStaffPin ? 'text' : 'password'}
                              maxLength={6}
                              placeholder="4–6 digits"
                              value={editStaffForm.pin}
                              onChange={e => setEditStaffForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                              className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 pr-9 text-sm font-mono font-semibold focus:border-brand-black focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditStaffPin(!showEditStaffPin)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400 hover:text-brand-black"
                            >
                              {showEditStaffPin ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Qualified Services Selector */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                            Qualified Services ({editStaffForm.serviceIds.length} assigned)
                          </label>
                          <div className="relative w-48">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                            <input
                              type="text"
                              placeholder="Filter..."
                              value={editStaffSearchQuery}
                              onChange={e => setEditStaffSearchQuery(e.target.value)}
                              className="w-full pl-7 pr-2 py-1 text-xs border border-brand-gray-200 rounded-lg focus:outline-none focus:border-brand-black"
                            />
                          </div>
                        </div>

                        <div className="max-h-48 overflow-y-auto border border-brand-gray-200 rounded-xl p-2 bg-brand-gray-50/40 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {services
                            .filter(s => s.name.toLowerCase().includes(editStaffSearchQuery.toLowerCase()))
                            .map(s => {
                              const isSelected = editStaffForm.serviceIds.includes(s._id);
                              return (
                                <button
                                  key={s._id}
                                  type="button"
                                  onClick={() =>
                                    setEditStaffForm(p => ({
                                      ...p,
                                      serviceIds: isSelected
                                        ? p.serviceIds.filter(id => id !== s._id)
                                        : [...p.serviceIds, s._id],
                                    }))
                                  }
                                  className={`p-2 rounded-lg text-left text-xs font-medium border flex items-center justify-between transition-all ${
                                    isSelected
                                      ? 'bg-brand-black text-white border-brand-black'
                                      : 'bg-white border-brand-gray-200 text-brand-black hover:border-brand-gray-400'
                                  }`}
                                >
                                  <span className="truncate pr-2">{s.name}</span>
                                  {isSelected && <Check size={12} className="shrink-0 text-white" />}
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-gray-100">
                        <button
                          type="button"
                          onClick={() => setEditingAttendantId(null)}
                          className="px-4 py-2 border border-brand-gray-200 text-brand-gray-600 hover:text-brand-black text-xs font-bold uppercase tracking-wider rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={editStaffSaving || !editStaffForm.name.trim()}
                          onClick={() => handleSaveEditStaff(a._id)}
                          className="px-4 py-2 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {editStaffSaving ? (
                            <Loader2 size={12} className="animate-spin text-white" />
                          ) : (
                            <Check size={12} />
                          )}
                          <span>Save Changes</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={a._id}
                    className="p-4 bg-white border border-brand-gray-200 rounded-xl shadow-xs transition-all hover:border-brand-black flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-black text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {a.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-serif font-bold text-base text-brand-black leading-tight">{a.name}</p>
                          <span
                            className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md ${
                              a.isActive !== false
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-brand-gray-100 text-brand-gray-500'
                            }`}
                          >
                            {a.isActive !== false ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-brand-gray-400 mt-0.5">
                          Handle: <span className="font-mono font-medium text-brand-gray-600">@{a.username}</span> •{' '}
                          {a.serviceIds?.length || 0} services
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSchedulingAttendant(a)}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-brand-gray-200 text-brand-black hover:border-brand-black bg-brand-gray-50/60 hover:bg-brand-gray-100 rounded-lg transition-all flex items-center gap-1.5"
                        title="Manage working hours, shifts, breaks and days off"
                      >
                        <Calendar size={12} className="text-brand-black" />
                        <span>Schedule</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAttendantId(a._id);
                          const currentIds = (a.serviceIds || []).map((s: any) =>
                            typeof s === 'object' ? s._id : s
                          );
                          setEditStaffForm({
                            name: a.name,
                            pin: '',
                            serviceIds: currentIds,
                          });
                          setEditStaffError(null);
                        }}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-brand-gray-200 text-brand-gray-600 hover:border-brand-black hover:text-brand-black rounded-lg transition-all"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(a)}
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border rounded-lg transition-all ${
                          a.isActive !== false
                            ? 'border-brand-gray-200 text-brand-gray-600 hover:border-brand-black hover:text-brand-black'
                            : 'border-brand-black bg-brand-black text-white'
                        }`}
                      >
                        {a.isActive !== false ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStaff(a)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all"
                        title="Delete staff account"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add New Staff Form */}
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
            New Staff Member
          </p>

          <form
            onSubmit={handleAddStaff}
            className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4"
          >
            {staffError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{staffError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Florence Muthoni"
                value={staffForm.name}
                onChange={e => setStaffForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. florence"
                  value={staffForm.username}
                  onChange={e =>
                    setStaffForm(p => ({
                      ...p,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                    }))
                  }
                  className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">PIN (4-6 Digits)</label>
                <div className="relative">
                  <input
                    type={showStaffPin ? 'text' : 'password'}
                    required
                    maxLength={6}
                    placeholder="••••"
                    value={staffForm.pin}
                    onChange={e => setStaffForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                    className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 pr-9 text-sm font-mono font-semibold focus:border-brand-black focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffPin(!showStaffPin)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400 hover:text-brand-black"
                  >
                    {showStaffPin ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Qualified Services Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                  Assign Services ({staffForm.serviceIds.length})
                </label>
                {staffForm.serviceIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStaffForm(p => ({ ...p, serviceIds: [] }))}
                    className="text-[10px] text-brand-gray-400 hover:text-red-500 font-bold uppercase"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
                <input
                  type="text"
                  placeholder="Filter catalog..."
                  value={addStaffSearchQuery}
                  onChange={e => setAddStaffSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-xs border border-brand-gray-200 rounded-lg focus:outline-none focus:border-brand-black"
                />
              </div>

              <div className="max-h-40 overflow-y-auto border border-brand-gray-200 rounded-xl p-2 bg-brand-gray-50/40 grid grid-cols-1 gap-1">
                {services
                  .filter(s => s.name.toLowerCase().includes(addStaffSearchQuery.toLowerCase()))
                  .map(s => {
                    const isSelected = staffForm.serviceIds.includes(s._id);
                    return (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() =>
                          setStaffForm(p => ({
                            ...p,
                            serviceIds: isSelected
                              ? p.serviceIds.filter(id => id !== s._id)
                              : [...p.serviceIds, s._id],
                          }))
                        }
                        className={`p-2 rounded-lg text-left text-xs font-medium border flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-brand-black text-white border-brand-black'
                            : 'bg-white border-brand-gray-200 text-brand-black hover:border-brand-gray-400'
                        }`}
                      >
                        <span className="truncate pr-2">{s.name}</span>
                        {isSelected && <Check size={12} className="shrink-0 text-white" />}
                      </button>
                    );
                  })}
              </div>
            </div>

            <button
              type="submit"
              disabled={
                !staffForm.name.trim() ||
                !staffForm.username.trim() ||
                staffForm.pin.length < 4 ||
                staffAddLoading
              }
              className="w-full py-3 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {staffAddLoading ? (
                <Loader2 size={14} className="animate-spin text-white" />
              ) : (
                <UserPlus size={14} />
              )}
              <span>Create Staff Account</span>
            </button>
          </form>
        </div>
      </div>

      {schedulingAttendant && (
        <AdminStaffScheduleModal
          isOpen={!!schedulingAttendant}
          onClose={() => setSchedulingAttendant(null)}
          attendant={schedulingAttendant}
          ownerPin={ownerPin}
          onSaved={updated => {
            onAttendantsUpdated(attendants.map(a => (a._id === updated._id ? updated : a)));
            setSchedulingAttendant(null);
          }}
          triggerToast={triggerToast}
        />
      )}
    </div>
  );
}
