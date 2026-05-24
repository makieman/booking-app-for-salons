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
  price: number;
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

/** Booking steps — 'attendant' is inserted between 'date' and 'time' */
export type BookingStep = 'service' | 'date' | 'attendant' | 'time' | 'contact' | 'confirmation';

/** The three modes the app can be in */
export type UserMode = 'customer' | 'attendant' | 'owner';

/** Decoded JWT payload stored client-side for session restore */
export interface AttendantSession {
  _id: string;
  name: string;
  token: string;
}
