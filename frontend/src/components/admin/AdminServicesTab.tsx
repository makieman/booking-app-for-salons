import React, { useState } from 'react';
import { Plus, Scissors, Check, Loader2, AlertCircle } from 'lucide-react';
import { Service } from '../../types';
import { formatPrice } from '../../utils/formatters';
import * as api from '../../api/client';

interface AdminServicesTabProps {
  services: Service[];
  loading: boolean;
  onServicesUpdated: (services: Service[]) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminServicesTab({
  services,
  loading,
  onServicesUpdated,
  triggerToast,
}: AdminServicesTabProps) {
  // Edit prices & durations state: Record<serviceId, string>
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [editPriceMaxes, setEditPriceMaxes] = useState<Record<string, string>>({});
  const [editDurations, setEditDurations] = useState<Record<string, string>>({});
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

  // New service form state
  const [addForm, setAddForm] = useState({
    name: '',
    duration: '',
    price: '',
    priceMax: '',
    description: '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Handle saving an existing service's edits
  const handleServiceEdit = async (service: Service) => {
    const currentPrice = editPrices[service._id] ?? String(service.price);
    const currentPriceMax = editPriceMaxes[service._id] ?? (service.priceMax ? String(service.priceMax) : '');
    const currentDuration = editDurations[service._id] ?? String(service.duration);

    const newPrice = Number(currentPrice);
    const newDuration = Number(currentDuration);

    if (isNaN(newPrice) || newPrice <= 0) {
      triggerToast('Price must be a valid positive number', 'error');
      return;
    }
    if (isNaN(newDuration) || newDuration <= 0) {
      triggerToast('Duration must be a valid positive number', 'error');
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

    setAddLoading(true);
    setAddError(null);
    try {
      const created = await api.createService({
        name: addForm.name.trim(),
        duration: Number(addForm.duration),
        price: Number(addForm.price),
        priceMax: addForm.priceMax ? Number(addForm.priceMax) : undefined,
        description: addForm.description.trim() || undefined,
      });

      onServicesUpdated([...services, created]);
      setAddForm({ name: '', duration: '', price: '', priceMax: '', description: '' });
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

                const isPriceDirty = currentPrice !== String(service.price);
                const isPriceMaxDirty = currentPriceMax !== (service.priceMax ? String(service.priceMax) : '');
                const isDurationDirty = currentDuration !== String(service.duration);
                const isDirty = isPriceDirty || isPriceMaxDirty || isDurationDirty;

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
