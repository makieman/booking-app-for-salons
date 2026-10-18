/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared TypeScript types for the Flo Sisterlocks frontend.
 */

export interface Service {
  _id: string;        // MongoDB ObjectId (from the backend)
  name: string;
  duration: number;   // in minutes
  price: number;      // base / minimum price in KES
  priceMax?: number;  // optional upper bound — set to show a range (e.g. KES 2,000 – 5,000)
  description: string;
  image: string;
  /** Minutes of rest/cleanup held after this service before the next slot opens */
  bufferAfterMinutes?: number;
  /** Whether service can end after salon closing time and stylist shift end */
  canExceedClosingTime?: boolean;
  /** Optional latest allowed start time (HH:mm) for long services */
  latestStartTime?: string;
}

export interface AttendantBreak {
  start: string; // HH:mm
  end: string;   // HH:mm
  label?: string;
}

export interface AttendantDaySchedule {
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  isWorkingDay: boolean;
  start: string; // HH:mm
  end: string;   // HH:mm
  breaks?: AttendantBreak[];
}

/** A single time-off entry for a stylist — whole day or a time range */
export interface TimeOffEntry {
  date: string;        // YYYY-MM-DD
  allDay: boolean;
  startTime?: string;  // HH:mm — only when allDay is false
  endTime?: string;    // HH:mm — only when allDay is false
  note?: string;
}

/** A staff member who performs services */
export interface Attendant {
  _id: string;
  name: string;
  /** IDs of services this attendant can perform */
  serviceIds: string[];
  /** Only present in admin view (populated) */
  username?: string;
  isActive?: boolean;
  schedule?: AttendantDaySchedule[];
  daysOff?: string[]; // Array of YYYY-MM-DD (kept for backward-compat)
  timeOff?: TimeOffEntry[]; // Structured time-off entries
}

export interface TimeSlot {
  time: string;       // HH:mm
  available: boolean;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';

export const MAX_SERVICES = 2;

export interface Booking {
  _id: string;                    // MongoDB ObjectId
  reference?: string;             // Unique booking reference (LMN-XXXXX)
  groupId?: string;               // Group identifier linking multi-service segments
  groupOrder?: number;            // 1, 2, etc.
  price?: number;                 // Historical price snapshot for this segment
  serviceId: string | Service;    // Can be populated or just an ID
  /** Populated attendant or ObjectId string. null = unassigned / "any" */
  attendantId?: string | Attendant | null;
  customerName: string;
  phone: string;
  email?: string;     // Optional — used for email notifications
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  status: BookingStatus;
  cancellationReason?: string;
  completedAt?: string;
  notes?: string;
  createdAt?: string;
}

export interface SelectedServiceItem {
  service: Service;
  attendant: Attendant | null; // null = "Any Available"
}

export interface MultiSlotSegment {
  serviceId: string;
  attendantId: string;
  attendantName: string;
  startTime: string;
  endTime: string;
}

export interface MultiSlotOption {
  time: string;
  endTime: string;
  segments: MultiSlotSegment[];
}

/** Booking steps — 'attendant' is inserted between 'date' and 'time', 'lookup' is standalone */
export type BookingStep = 'service' | 'date' | 'attendant' | 'time' | 'contact' | 'confirmation' | 'lookup';

/** The three modes the app can be in */
export type UserMode = 'customer' | 'attendant' | 'owner';

/** Decoded JWT payload stored client-side for session restore */
export interface AttendantSession {
  _id: string;
  name: string;
  token: string;
}

export interface TenantScheduleBreak {
  label: string;      // e.g. "Lunch", "Staff meeting"
  start: string;      // HH:mm
  end: string;        // HH:mm
}

export interface TenantBookingRules {
  slotInterval: number; // 15 | 30 | 45 | 60 (default: 30)
  bufferMinutes: number; // default: 0
  minNoticeHours: number; // default: 2
  holidays?: string[]; // Array of YYYY-MM-DD
  closedWeekdays?: number[]; // 0=Sun … 6=Sat
  breaks?: TenantScheduleBreak[];
}

export interface Tenant {
  _id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  timezone: string;
  workingHours: { start: string; end: string };
  bookingRules?: TenantBookingRules;
  branding: {
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    emailFromName?: string;
    emailReplyTo?: string;
    whatsappSenderNumber?: string;
  };
  locale: 'en' | 'sw';
  mpesaTillNumber?: string;
  mpesaPaybillNumber?: string;
  supportPhone?: string;
  supportEmail?: string;
  plan: 'free' | 'paid';
  isActive: boolean;
}
