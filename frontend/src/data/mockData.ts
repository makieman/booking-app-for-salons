/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from '../types';

// Fallback data used when the backend is unavailable
export const FALLBACK_SERVICES: Service[] = [
  {
    _id: '1',
    name: 'Sisterlocks™ Installation',
    duration: 1200,
    price: 10000,
    priceMax: 20000,
    description: 'Professional installation by a certified consultant.',
    image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?auto=format&fit=crop&q=80&w=400',
  },
  {
    _id: '2',
    name: 'Retightening & Maintenance',
    duration: 240,
    price: 3500,
    priceMax: 6000,
    description: 'Regular maintenance to keep your Sisterlocks neat and healthy.',
    image: 'https://images.unsplash.com/photo-1620331311520-246422fd82f9?auto=format&fit=crop&q=80&w=400',
  },
  {
    _id: '3',
    name: 'Consultation',
    duration: 60,
    price: 1000,
    description: 'Mandatory session before installation.',
    image: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc2069?auto=format&fit=crop&q=80&w=400',
  },
  {
    _id: '4',
    name: 'Nails & Beauty',
    duration: 60,
    price: 1500,
    priceMax: 4000,
    description: 'Manicure, pedicure, and other beauty treatments.',
    image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&q=80&w=400',
  },
  {
    _id: '5',
    name: 'Human Hair Extensions',
    duration: 180,
    price: 15000,
    priceMax: 35000,
    description: 'Premium human hair extension installation.',
    image: 'https://images.unsplash.com/photo-1522338140262-f46f5913618a?auto=format&fit=crop&q=80&w=400',
  },
];


export const FALLBACK_TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
];
