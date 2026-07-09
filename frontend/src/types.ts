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
}

export interface TimeSlot {
  time: string;       // HH:mm
  available: boolean;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  _id: string;                    // MongoDB ObjectId
  reference?: string;             // Unique booking reference (LMN-XXXXX)
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
  createdAt?: string;
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

export interface Tenant {
  _id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  timezone: string;
  workingHours: { start: string; end: string };
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
