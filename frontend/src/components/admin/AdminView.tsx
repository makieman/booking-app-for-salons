import React, { useState, useEffect, useCallback } from 'react';
import { Booking, Service, Attendant, Tenant } from '../../types';
import * as api from '../../api/client';
import { useTenant } from '../../hooks/useTenant';
import { useAdminPushNotifications } from '../../hooks/useAdminPushNotifications';
import { playNotificationSound } from '../../utils/notificationSound';
import { getTodayDateString } from '../../utils/dateUtils';
import { AdminLayout, AdminTabKey } from './AdminLayout';
import { AdminDashboardTab } from './AdminDashboardTab';
import { AdminScheduleTab } from './AdminScheduleTab';
import { AdminRequestsTab } from './AdminRequestsTab';
import { AdminServicesTab } from './AdminServicesTab';
import { AdminStaffTab } from './AdminStaffTab';
import { AdminSettingsTab } from './AdminSettingsTab';
import { AdminSearchModal } from './AdminSearchModal';

interface AdminViewProps {
  bookings: Booking[];
  ownerPin?: string;
  ownerToken: string;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminView({
  bookings: initialBookings,
  ownerPin: initialOwnerPin,
  ownerToken,
  triggerToast,
}: AdminViewProps) {
  const { tenant, tenantSlug, navigate, setTenant } = useTenant();

  // Read initial tab from URL if present
  const getInitialTab = (): AdminTabKey => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as AdminTabKey;
      if (['dashboard', 'ledger', 'pending', 'services', 'staff', 'settings'].includes(tabParam)) {
        return tabParam;
      }
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<AdminTabKey>(getInitialTab);

  // Global search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchSelectedBookingId, setSearchSelectedBookingId] = useState<string | null>(null);
  const [searchSelectedDate, setSearchSelectedDate] = useState<string | null>(null);

  // Keyboard shortcut Cmd+K / Ctrl+K to open global search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectBookingFromSearch = (booking: Booking, targetTab: 'ledger' | 'pending') => {
    if (targetTab === 'ledger') {
      setSearchSelectedDate(booking.date);
      setSearchSelectedBookingId(booking._id);
    }
    handleTabChange(targetTab);
  };

  // Sync tab changes with URL query string without reloading
  const handleTabChange = useCallback((tab: AdminTabKey) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Listen to browser popstate (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const tab = getInitialTab();
      setActiveTab(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Centralized State
  const [allTenantBookings, setAllTenantBookings] = useState<Booking[]>(initialBookings);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>(initialBookings);
  const [services, setServices] = useState<Service[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);

  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [ownerPin] = useState(initialOwnerPin || '');

  // Admin Push Notifications
  const adminPush = useAdminPushNotifications();
  const [showPushBanner, setShowPushBanner] = useState(false);

  // Auto-subscribe on mount if granted; prompt banner if default
  useEffect(() => {
    if (adminPush.permission === 'unsupported') return;
    const dismissed = localStorage.getItem('adminPushBannerDismissed') === 'true';
    if (adminPush.isSubscribed) {
      setShowPushBanner(false);
      return;
    }
    if (adminPush.permission === 'granted') {
      adminPush.subscribe();
      setShowPushBanner(false);
    } else if (adminPush.permission === 'default' && !dismissed) {
      setShowPushBanner(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPush.permission, adminPush.isSubscribed]);

  // Load bookings on mount
  useEffect(() => {
    if (!tenant) return;
    api.getAdminBookings()
      .then(data => {
        setAllTenantBookings(data);
        setPendingBookings(data.filter((b: Booking) => b.status === 'pending'));
        setConfirmedBookings(data.filter((b: Booking) => b.status === 'confirmed'));
      })
      .catch(err => {
        console.error('[AdminView] Failed to load bookings:', err);
      });
  }, [tenant?._id]);

  // Load services on mount
  useEffect(() => {
    if (!tenant) return;
    setLoadingServices(true);
    api.getServices()
      .then(data => setServices(data))
      .catch(err => console.error('[AdminView] Failed to load services:', err))
      .finally(() => setLoadingServices(false));
  }, [tenant?._id]);

  // Load pending bookings when opening Pending tab
  useEffect(() => {
    if (!tenant) return;
    if (activeTab === 'pending') {
      setLoadingPending(true);
      api.getAdminBookings('pending')
        .then(data => setPendingBookings(data))
        .catch(err => console.error('[AdminView] Failed to load pending bookings:', err))
        .finally(() => setLoadingPending(false));
    }
  }, [tenant?._id, activeTab]);

  // Load staff on mount or tab change
  useEffect(() => {
    if (!tenant) return;
    setLoadingStaff(true);
    api.getAttendants(ownerPin)
      .then(data => setAttendants(data))
      .catch(err => console.error('[AdminView] Failed to load staff:', err))
      .finally(() => setLoadingStaff(false));
  }, [tenant?._id, ownerPin]);

  // Handle general booking update (reschedule, cancel, complete, no-show, notes)
  const handleUpdateBooking = async (
    bookingId: string,
    payload: api.AdminUpdateBookingPayload
  ) => {
    setActionLoadingId(bookingId);
    try {
      const updated = await api.updateBookingStatus(bookingId, payload);

      // Local optimistic update
      setAllTenantBookings(prev => {
        const target = prev.find(b => b._id === bookingId);
        const targetGroupId = target?.groupId;
        return prev.map(b => {
          const isMatch = b._id === bookingId || (targetGroupId && b.groupId === targetGroupId);
          if (!isMatch) return b;
          return {
            ...b,
            ...(payload.status ? { status: payload.status } : {}),
            ...(payload.reschedule ? { date: payload.reschedule.date, startTime: payload.reschedule.startTime } : {}),
            ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
            ...(payload.cancellationReason ? { cancellationReason: payload.cancellationReason } : {}),
          };
        });
      });

      if (payload.status) {
        setPendingBookings(prev => prev.filter(b => b._id !== bookingId));
      }

      // Re-fetch bookings in background to ensure exact DB alignment
      api.getAdminBookings().then(data => {
        setAllTenantBookings(data);
        setPendingBookings(data.filter((b: Booking) => b.status === 'pending'));
        setConfirmedBookings(data.filter((b: Booking) => b.status === 'confirmed'));
      }).catch(console.error);

      triggerToast('Booking updated successfully!', 'success');
    } catch (err: any) {
      console.error('[AdminView] Update booking error:', err);
      triggerToast(err.message || 'Failed to update booking', 'error');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle status update (confirm / decline)
  // FIX ISSUE 8 & 11 & 17:
  // - Updates all tenant bookings so stats don't go stale
  // - Handles all segment IDs in a group
  // - Shows toast feedback on errors and successes
  const handleStatusUpdate = async (
    bookingId: string,
    status: 'confirmed' | 'cancelled',
    groupBookingIds?: string[]
  ) => {
    setActionLoadingId(bookingId);
    try {
      const updated = await api.updateBookingStatus(bookingId, status);
      const affectedIds = new Set(groupBookingIds && groupBookingIds.length > 0 ? groupBookingIds : [bookingId]);

      // Remove affected segments from pending queue
      setPendingBookings(prev => prev.filter(b => !affectedIds.has(b._id)));

      // Add to confirmed bookings if confirmed
      if (status === 'confirmed') {
        setConfirmedBookings(prev => [...prev, updated]);
      }

      // FIX ISSUE 8: Keep allTenantBookings in sync so dashboard stats reflect action immediately
      setAllTenantBookings(prev =>
        prev.map(b => (affectedIds.has(b._id) ? { ...b, status } : b))
      );

      triggerToast(
        status === 'confirmed' ? 'Appointment confirmed successfully!' : 'Appointment declined.',
        'success'
      );
    } catch (err: any) {
      console.error('[AdminView] Status update error:', err);
      triggerToast(err.message || 'Failed to update booking status', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Sign out handler
  const handleSignOut = () => {
    localStorage.removeItem('ownerToken');
    api.setApiAuthToken(null);
    navigate('admin', tenantSlug || undefined);
    window.location.reload();
  };

  // Back to customer view
  const handleBackToSalon = () => {
    navigate('customer', tenantSlug || undefined);
  };

  // Enable push from top banner
  const handleEnablePushFromBanner = async () => {
    const ok = await adminPush.subscribe();
    if (ok) {
      setShowPushBanner(false);
      playNotificationSound('chime');
      triggerToast('Booking alerts enabled!', 'success');
    }
  };

  const handleDismissPushBanner = () => {
    setShowPushBanner(false);
    localStorage.setItem('adminPushBannerDismissed', 'true');
  };

  // Nairobi timezone today bookings for schedule and dashboard
  const todayStr = getTodayDateString();
  const todayConfirmed = allTenantBookings.filter(b => b.date === todayStr);

  // Handle new booking creation from walk-in / phone modal
  const handleBookingCreated = (newBooking: Booking) => {
    setAllTenantBookings(prev => [newBooking, ...prev]);
    if (newBooking.status === 'confirmed') {
      setConfirmedBookings(prev => [newBooking, ...prev]);
    } else if (newBooking.status === 'pending') {
      setPendingBookings(prev => [newBooking, ...prev]);
    }
  };

  return (
    <>
      <AdminLayout
        tenant={tenant}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        pendingCount={pendingBookings.length}
        onSignOut={handleSignOut}
        onBackToSalon={handleBackToSalon}
        adminPush={adminPush}
        showPushBanner={showPushBanner}
        onDismissPushBanner={handleDismissPushBanner}
        onEnablePushFromBanner={handleEnablePushFromBanner}
        onOpenSearch={() => setIsSearchOpen(true)}
      >
        {activeTab === 'dashboard' && (
          <AdminDashboardTab
            bookings={allTenantBookings}
            pendingCount={pendingBookings.length}
            services={services}
            todayBookings={todayConfirmed}
            onNavigateTab={handleTabChange}
          />
        )}

        {activeTab === 'ledger' && (
          <AdminScheduleTab
            bookings={allTenantBookings}
            attendants={attendants}
            services={services}
            onUpdateBooking={handleUpdateBooking}
            onBookingCreated={handleBookingCreated}
            triggerToast={triggerToast}
            initialDate={searchSelectedDate}
            initialBookingId={searchSelectedBookingId}
          />
        )}

        {activeTab === 'pending' && (
          <AdminRequestsTab
            pendingBookings={pendingBookings}
            loading={loadingPending}
            actionLoadingId={actionLoadingId}
            onStatusUpdate={handleStatusUpdate}
          />
        )}

        {activeTab === 'services' && (
          <AdminServicesTab
            services={services}
            attendants={attendants}
            ownerPin={ownerPin}
            loading={loadingServices}
            onServicesUpdated={setServices}
            onAttendantsUpdated={setAttendants}
            triggerToast={triggerToast}
          />
        )}

        {activeTab === 'staff' && (
          <AdminStaffTab
            attendants={attendants}
            services={services}
            loading={loadingStaff}
            ownerPin={ownerPin}
            onAttendantsUpdated={setAttendants}
            triggerToast={triggerToast}
          />
        )}

        {activeTab === 'settings' && ownerToken && (
          <AdminSettingsTab
            tenant={tenant}
            ownerToken={ownerToken}
            onTenantUpdated={setTenant}
            triggerToast={triggerToast}
          />
        )}
      </AdminLayout>

      {/* Global Appointment Search Modal */}
      <AdminSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        bookings={allTenantBookings}
        onSelectBooking={handleSelectBookingFromSearch}
      />
    </>
  );
}
export default AdminView;
