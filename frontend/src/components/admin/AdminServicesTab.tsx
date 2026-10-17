import React, { useState, useRef, useEffect } from 'react';
import { Plus, Scissors, Check, Loader2, AlertCircle, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Service, Attendant } from '../../types';
import { formatPrice } from '../../utils/formatters';
import * as api from '../../api/client';

interface AdminServicesTabProps {
  services: Service[];
  loading: boolean;
  onServicesUpdated: (services: Service[]) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
  attendants?: Attendant[];
  ownerPin?: string;
  onAttendantsUpdated?: (attendants: Attendant[]) => void;
}

function StylistDropdownBadge({
  serviceId,
  attendants,
  ownerPin,
  onAttendantsUpdated,
  triggerToast,
}: {
  serviceId: string;
  attendants: Attendant[];
  ownerPin?: string;
  onAttendantsUpdated?: (attendants: Attendant[]) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [open, setOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const assigned = attendants.filter(a =>
    (a.serviceIds || []).some((s: any) => (typeof s === 'object' ? s._id : s) === serviceId)
  );

  const isAll = assigned.length === 0;
  const count = isAll ? attendants.length : assigned.length;

  const handleToggleStylist = async (attendant: Attendant) => {
    if (!ownerPin || !onAttendantsUpdated) return;

    setUpdatingId(attendant._id);
    try {
      const currentIds = (attendant.serviceIds || []).map((s: any) =>
        typeof s === 'object' ? s._id : s
      );
      const isCurrentlyAssigned = currentIds.includes(serviceId);
      const newIds = isCurrentlyAssigned
        ? currentIds.filter((id: string) => id !== serviceId)
        : [...currentIds, serviceId];

      const updated = await api.updateAttendant(ownerPin, attendant._id, {
        serviceIds: newIds,
      });

      const nextAttendants = attendants.map(a => (a._id === attendant._id ? updated : a));
      onAttendantsUpdated(nextAttendants);
      triggerToast?.(
        isCurrentlyAssigned
          ? `${attendant.name} unassigned from service`
          : `${attendant.name} assigned to service`,
        'success'
      );
    } catch (err: any) {
      console.error(err);
      triggerToast?.(err.message || 'Failed to update stylist assignment', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSelectAll = async () => {
    if (!ownerPin || !onAttendantsUpdated) return;
    setUpdatingId('all');
    try {
      const updatedList = await Promise.all(
        attendants.map(async a => {
          const currentIds = (a.serviceIds || []).map((s: any) =>
            typeof s === 'object' ? s._id : s
          );
          if (!currentIds.includes(serviceId)) {
            return await api.updateAttendant(ownerPin, a._id, {
              serviceIds: [...currentIds, serviceId],
            });
          }
          return a;
        })
      );
      onAttendantsUpdated(updatedList);
      triggerToast?.('All stylists assigned to service', 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast?.('Failed to assign all stylists', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!ownerPin || !onAttendantsUpdated) return;
    setUpdatingId('all');
    try {
      const updatedList = await Promise.all(
        attendants.map(async a => {
          const currentIds = (a.serviceIds || []).map((s: any) =>
            typeof s === 'object' ? s._id : s
          );
          if (currentIds.includes(serviceId)) {
            return await api.updateAttendant(ownerPin, a._id, {
              serviceIds: currentIds.filter((id: string) => id !== serviceId),
            });
          }
          return a;
        })
      );
      onAttendantsUpdated(updatedList);
      triggerToast?.('Reset to all stylists (open default)', 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast?.('Failed to reset assignments', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="relative inline-block mt-1" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
          open
            ? 'bg-brand-black text-white border-brand-black shadow-xs'
            : isAll
            ? 'bg-brand-gray-50 text-brand-gray-600 border-brand-gray-200 hover:border-brand-gray-400 hover:bg-white'
            : 'bg-brand-gray-100 text-brand-black border-brand-gray-300 hover:border-brand-black'
        }`}
        title="Click to view or edit assigned stylists"
      >
        <Users size={10} className={open ? 'text-white' : 'text-brand-gray-400'} />
        <span>{isAll ? `All stylists (${count})` : `${count} stylist${count > 1 ? 's' : ''}`}</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-brand-gray-200 rounded-xl shadow-xl z-40 p-2.5 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-brand-gray-100">
            <div>
              <span className="font-bold text-[10px] uppercase tracking-wider text-brand-black block">
                {isAll ? 'Available to all staff' : `${assigned.length} assigned`}
              </span>
              <span className="text-[10px] text-brand-gray-400">
                {isAll ? 'Default open availability' : `${attendants.length} total stylists`}
              </span>
            </div>
            {ownerPin && (
              <button
                type="button"
                disabled={updatingId !== null}
                onClick={isAll ? handleSelectAll : handleClearAll}
                className="text-[10px] font-bold text-brand-black hover:underline cursor-pointer disabled:opacity-50"
              >
                {isAll ? 'Tag all' : 'Reset to all'}
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
            {attendants.map(a => {
              const isAssigned = (a.serviceIds || []).some(
                (s: any) => (typeof s === 'object' ? s._id : s) === serviceId
              );
              const isItemUpdating = updatingId === a._id || updatingId === 'all';

              return (
                <button
                  key={a._id}
                  type="button"
                  disabled={!ownerPin || isItemUpdating}
                  onClick={() => handleToggleStylist(a)}
                  className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left transition-all cursor-pointer ${
                    isAssigned
                      ? 'bg-brand-gray-100/80 text-brand-black hover:bg-brand-gray-200/80'
                      : isAll
                      ? 'hover:bg-brand-gray-50 text-brand-black'
                      : 'hover:bg-brand-gray-50 text-brand-gray-500'
                  }`}
                  title={ownerPin ? `Click to ${isAssigned ? 'unassign' : 'assign'}` : undefined}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div
                      className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 ${
                        isAssigned
                          ? 'bg-brand-black text-white'
                          : 'bg-brand-gray-200 text-brand-gray-600'
                      }`}
                    >
                      {a.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <span className="font-semibold block truncate leading-tight text-xs">
                        {a.name}
                      </span>
                      {a.username && (
                        <span className="text-[10px] font-mono text-brand-gray-400 block leading-none">
                          @{a.username}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 ml-2">
                    {isItemUpdating ? (
                      <Loader2 size={12} className="animate-spin text-brand-gray-400" />
                    ) : isAssigned ? (
                      <div className="w-4 h-4 rounded-md bg-brand-black flex items-center justify-center">
                        <Check size={11} className="text-white" />
                      </div>
                    ) : (
                      <div
                        className={`w-4 h-4 rounded-md border ${
                          isAll
                            ? 'border-emerald-400 bg-emerald-50/50'
                            : 'border-brand-gray-300'
                        }`}
                        title={isAll ? 'Available by default' : 'Not assigned'}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {isAll && (
            <p className="text-[10px] text-brand-gray-400 pt-1 border-t border-brand-gray-100 leading-tight">
              Tip: Click any stylist above to restrict this service to specific staff.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminServicesTab({
  services,
  loading,
  onServicesUpdated,
  triggerToast,
  attendants,
  ownerPin,
  onAttendantsUpdated,
}: AdminServicesTabProps) {
  // Edit prices & durations state: Record<serviceId, string>
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [editPriceMaxes, setEditPriceMaxes] = useState<Record<string, string>>({});
  const [editDurations, setEditDurations] = useState<Record<string, string>>({});
  const [editBuffers, setEditBuffers] = useState<Record<string, string>>({});
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

  // New service form state
  const [addForm, setAddForm] = useState({
    name: '',
    duration: '',
    price: '',
    priceMax: '',
    description: '',
    bufferAfterMinutes: '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedAttendantIds, setSelectedAttendantIds] = useState<string[]>([]);
  const [isStylistDropdownOpen, setIsStylistDropdownOpen] = useState(false);

  // Handle saving an existing service's edits
  const handleServiceEdit = async (service: Service) => {
    const currentPrice = editPrices[service._id] ?? String(service.price);
    const currentPriceMax = editPriceMaxes[service._id] ?? (service.priceMax ? String(service.priceMax) : '');
    const currentDuration = editDurations[service._id] ?? String(service.duration);
    const currentBuffer = editBuffers[service._id] ?? String(service.bufferAfterMinutes ?? 0);

    const newPrice = Number(currentPrice);
    const newDuration = Number(currentDuration);
    const newBuffer = Number(currentBuffer);

    if (isNaN(newPrice) || newPrice <= 0) {
      triggerToast('Price must be a valid positive number', 'error');
      return;
    }
    if (isNaN(newDuration) || newDuration <= 0) {
      triggerToast('Duration must be a valid positive number', 'error');
      return;
    }
    if (isNaN(newBuffer) || newBuffer < 0) {
      triggerToast('Rest time cannot be negative', 'error');
      return;
    }

    const newPriceMax = currentPriceMax && currentPriceMax !== '' ? Number(currentPriceMax) : null;
    if (newPriceMax !== null && newPriceMax < newPrice) {
      triggerToast('Maximum price cannot be less than minimum price', 'error');
      return;
    }

    // FIX ISSUE 9: set saving ID so spinner displays and button disables
    setSavingPriceId(service._id);
    try {
      const updated = await api.updateService(service._id, {
        price: newPrice,
        duration: newDuration,
        priceMax: newPriceMax,
        bufferAfterMinutes: newBuffer,
      });

      onServicesUpdated(services.map(s => (s._id === service._id ? updated : s)));
      triggerToast('Service updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Failed to update service details', 'error');
    } finally {
      setSavingPriceId(null);
    }
  };

  // Handle adding a new service
  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.duration || !addForm.price) return;

    if (addForm.bufferAfterMinutes) {
      const buf = Number(addForm.bufferAfterMinutes);
      if (isNaN(buf) || buf < 0) {
        setAddError('Rest after service cannot be negative');
        return;
      }
    }

    setAddLoading(true);
    setAddError(null);
    try {
      const created = await api.createService({
        name: addForm.name.trim(),
        duration: Number(addForm.duration),
        price: Number(addForm.price),
        priceMax: addForm.priceMax ? Number(addForm.priceMax) : undefined,
        description: addForm.description.trim() || undefined,
        bufferAfterMinutes: addForm.bufferAfterMinutes ? Number(addForm.bufferAfterMinutes) : 0,
      });

      // If specific stylists were selected, update their service qualifications
      if (selectedAttendantIds.length > 0 && ownerPin && onAttendantsUpdated && attendants) {
        try {
          const updatedAttendants = await Promise.all(
            attendants.map(async a => {
              if (selectedAttendantIds.includes(a._id)) {
                const currentIds = (a.serviceIds || []).map((s: any) =>
                  typeof s === 'object' ? s._id : s
                );
                if (!currentIds.includes(created._id)) {
                  return await api.updateAttendant(ownerPin, a._id, {
                    serviceIds: [...currentIds, created._id],
                  });
                }
              }
              return a;
            })
          );
          onAttendantsUpdated(updatedAttendants);
        } catch (attErr) {
          console.error('Failed to link attendants to new service:', attErr);
        }
      }

      onServicesUpdated([...services, created]);
      setAddForm({ name: '', duration: '', price: '', priceMax: '', description: '', bufferAfterMinutes: '' });
      setSelectedAttendantIds([]);
      triggerToast('New service created successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      setAddError(err.message || 'Failed to create service');
      triggerToast(err.message || 'Failed to create service', 'error');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-brand-gray-100 pb-4">
        <h2 className="text-2xl font-serif font-black uppercase text-brand-black">Services & Pricing</h2>
        <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-400 mt-1">
          Manage services, baseline durations, and pricing tiers
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Services List (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
            Catalog Services ({services.length})
          </p>

          {loading ? (
            <div className="p-16 text-center border border-brand-gray-100 bg-white rounded-2xl flex items-center justify-center gap-2 text-brand-gray-500 font-medium text-sm">
              <Loader2 size={16} className="animate-spin text-brand-black" />
              <span>Loading services...</span>
            </div>
          ) : services.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-brand-gray-100 bg-white rounded-2xl text-brand-gray-400">
              <p className="font-serif italic text-base">No services configured yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {services.map(service => {
                const isSaving = savingPriceId === service._id;
                const currentPrice = editPrices[service._id] ?? String(service.price);
                const currentPriceMax = editPriceMaxes[service._id] ?? (service.priceMax ? String(service.priceMax) : '');
                const currentDuration = editDurations[service._id] ?? String(service.duration);
                const currentBuffer = editBuffers[service._id] ?? String(service.bufferAfterMinutes ?? 0);

                const isPriceDirty = currentPrice !== String(service.price);
                const isPriceMaxDirty = currentPriceMax !== (service.priceMax ? String(service.priceMax) : '');
                const isDurationDirty = currentDuration !== String(service.duration);
                const isBufferDirty = currentBuffer !== String(service.bufferAfterMinutes ?? 0);
                const isDirty = isPriceDirty || isPriceMaxDirty || isDurationDirty || isBufferDirty;

                return (
                  <div
                    key={service._id}
                    className="p-5 bg-white border border-brand-gray-200 rounded-xl shadow-xs transition-all hover:border-brand-black"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-serif font-bold text-lg text-brand-black leading-tight">
                          {service.name}
                        </p>
                        {service.description && (
                          <p className="text-xs text-brand-gray-500 mt-1 line-clamp-1">{service.description}</p>
                        )}
                        {attendants && attendants.length > 0 && (
                          <StylistDropdownBadge
                            serviceId={service._id}
                            attendants={attendants}
                            ownerPin={ownerPin}
                            onAttendantsUpdated={onAttendantsUpdated}
                            triggerToast={triggerToast}
                          />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Duration */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
                            Min
                          </span>
                          <input
                            type="number"
                            min="5"
                            max="720"
                            value={currentDuration}
                            onChange={e => setEditDurations(prev => ({ ...prev, [service._id]: e.target.value }))}
                            className="w-16 text-center font-bold font-mono text-sm border border-brand-gray-200 rounded-lg py-1 bg-brand-gray-50/50 focus:bg-white focus:border-brand-black focus:outline-none transition-colors"
                          />
                        </div>

                        {/* Min Price */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
                            KES
                          </span>
                          <input
                            type="number"
                            value={currentPrice}
                            onChange={e => setEditPrices(prev => ({ ...prev, [service._id]: e.target.value }))}
                            className="w-20 text-center font-bold font-mono text-sm border border-brand-gray-200 rounded-lg py-1 bg-brand-gray-50/50 focus:bg-white focus:border-brand-black focus:outline-none transition-colors"
                          />
                        </div>

                        {/* Max Price */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
                            Max
                          </span>
                          <input
                            type="number"
                            placeholder="—"
                            value={currentPriceMax}
                            onChange={e => setEditPriceMaxes(prev => ({ ...prev, [service._id]: e.target.value }))}
                            className="w-20 text-center font-bold font-mono text-sm border border-brand-gray-200 rounded-lg py-1 bg-brand-gray-50/50 focus:bg-white focus:border-brand-black focus:outline-none transition-colors"
                          />
                        </div>

                        {/* Rest after (buffer) */}
                        <div className="flex items-center gap-1.5" title="Minutes of rest or cleanup held after this service">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gray-400">
                            Rest
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="120"
                            placeholder="0"
                            value={currentBuffer}
                            onChange={e => setEditBuffers(prev => ({ ...prev, [service._id]: e.target.value }))}
                            className="w-14 text-center font-bold font-mono text-sm border border-brand-gray-200 rounded-lg py-1 bg-brand-gray-50/50 focus:bg-white focus:border-brand-black focus:outline-none transition-colors"
                          />
                        </div>

                        {/* Save Button */}
                        {isDirty && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleServiceEdit(service)}
                            className="px-3.5 py-1.5 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            {isSaving ? (
                              <Loader2 size={12} className="animate-spin text-white" />
                            ) : (
                              <Check size={12} />
                            )}
                            <span>Save</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add New Service Form */}
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-500">
            Create Service
          </p>

          <form
            onSubmit={handleAddService}
            className="p-6 bg-white border border-brand-gray-200 rounded-2xl shadow-xs space-y-4"
          >
            {addError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Service Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Sisterlocks Retightening"
                value={addForm.name}
                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Duration (min)</label>
                <input
                  type="number"
                  required
                  placeholder="60"
                  value={addForm.duration}
                  onChange={e => setAddForm(p => ({ ...p, duration: e.target.value }))}
                  className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">Min Price (KES)</label>
                <input
                  type="number"
                  required
                  placeholder="2500"
                  value={addForm.price}
                  onChange={e => setAddForm(p => ({ ...p, price: e.target.value }))}
                  className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                Max Price (KES) <span className="text-brand-gray-400 font-normal lowercase">(optional)</span>
              </label>
              <input
                type="number"
                placeholder="Optional range cap"
                value={addForm.priceMax}
                onChange={e => setAddForm(p => ({ ...p, priceMax: e.target.value }))}
                className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                Description <span className="text-brand-gray-400 font-normal lowercase">(optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Brief summary of what the service entails"
                value={addForm.description}
                onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm focus:border-brand-black focus:outline-none transition-colors resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600">
                Rest after service (min) <span className="text-brand-gray-400 font-normal lowercase">(optional)</span>
              </label>
              <input
                type="number"
                min={0}
                max={120}
                placeholder="0"
                value={addForm.bufferAfterMinutes}
                onChange={e => setAddForm(p => ({ ...p, bufferAfterMinutes: e.target.value }))}
                className="w-full border border-brand-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:border-brand-black focus:outline-none transition-colors"
              />
              <p className="text-[11px] text-brand-gray-400">
                Minutes held after this service ends before the next booking can start (cleanup, reset, etc.).
              </p>
            </div>

            {/* Stylist assignment dropdown / accordion */}
            {attendants && attendants.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsStylistDropdownOpen(!isStylistDropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-brand-gray-200 rounded-xl bg-brand-gray-50/50 hover:bg-brand-gray-100/70 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-brand-gray-500" />
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-gray-700 block">
                        Assign Stylists
                      </span>
                      <span className="text-[11px] text-brand-gray-500">
                        {selectedAttendantIds.length === 0
                          ? `All active stylists (${attendants.length}) by default`
                          : `${selectedAttendantIds.length} of ${attendants.length} selected`}
                      </span>
                    </div>
                  </div>
                  {isStylistDropdownOpen ? (
                    <ChevronUp size={14} className="text-brand-gray-500" />
                  ) : (
                    <ChevronDown size={14} className="text-brand-gray-500" />
                  )}
                </button>

                {isStylistDropdownOpen && (
                  <div className="border border-brand-gray-200 rounded-xl p-3 bg-white space-y-2 shadow-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-brand-gray-100">
                      <span className="text-[11px] text-brand-gray-500">Select who can perform this:</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedAttendantIds.length === attendants.length) {
                            setSelectedAttendantIds([]);
                          } else {
                            setSelectedAttendantIds(attendants.map(a => a._id));
                          }
                        }}
                        className="text-[11px] font-bold text-brand-black hover:underline cursor-pointer"
                      >
                        {selectedAttendantIds.length === attendants.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>

                    <div className="max-h-36 overflow-y-auto grid grid-cols-2 gap-1.5 pt-1">
                      {attendants.map(a => {
                        const isSelected = selectedAttendantIds.includes(a._id);
                        return (
                          <button
                            key={a._id}
                            type="button"
                            onClick={() =>
                              setSelectedAttendantIds(prev =>
                                isSelected ? prev.filter(id => id !== a._id) : [...prev, a._id]
                              )
                            }
                            className={`p-2 rounded-lg text-left text-xs font-medium border flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-brand-black text-white border-brand-black shadow-xs'
                                : 'bg-white border-brand-gray-200 text-brand-black hover:border-brand-gray-400'
                            }`}
                          >
                            <span className="truncate pr-1">{a.name}</span>
                            {isSelected && <Check size={12} className="shrink-0 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!addForm.name.trim() || !addForm.duration || !addForm.price || addLoading}
              className="w-full py-3 bg-brand-black hover:bg-brand-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {addLoading ? (
                <Loader2 size={14} className="animate-spin text-white" />
              ) : (
                <Plus size={14} />
              )}
              <span>Add New Service</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
