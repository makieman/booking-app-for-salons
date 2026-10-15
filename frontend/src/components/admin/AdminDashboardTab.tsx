import React from 'react';
import { SalonDashboard } from '../SalonDashboard';
import { Booking, Service } from '../../types';
import { AdminTabKey } from './AdminLayout';

interface AdminDashboardTabProps {
  bookings: Booking[];
  pendingCount: number;
  services: Service[];
  todayBookings: Booking[];
  onNavigateTab: (tab: AdminTabKey) => void;
}

export function AdminDashboardTab({
  bookings,
  pendingCount,
  services,
  todayBookings,
  onNavigateTab,
}: AdminDashboardTabProps) {
  return (
    <div className="space-y-6">
      <SalonDashboard
        bookings={bookings}
        pendingCount={pendingCount}
        onNavigateTab={onNavigateTab}
        services={services}
        todayBookings={todayBookings}
      />
    </div>
  );
}
