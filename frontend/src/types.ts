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

export interface TimeSlot {
  time: string;       // HH:mm
  available: boolean;
}

export interface Booking {
  _id: string;        // MongoDB ObjectId
  serviceId: string | Service;  // Can be populated or just an ID
  customerName: string;
  phone: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
}

export type BookingStep = 'service' | 'date' | 'time' | 'contact' | 'confirmation';
