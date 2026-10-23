import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { generateGoogleCalendarUrl } from '../services/emailService';

const templatesDir = path.join(process.cwd(), 'templates');

const mockTenant = {
  name: 'Flo Sisterlocks',
  slug: 'flo-sisterlocks',
  timezone: 'Africa/Nairobi',
  supportPhone: '+254712345678',
  supportEmail: 'hello@flosisterlocks.com',
  branding: {
    primaryColor: '#C4466F',
    logoUrl: 'https://example.com/logo.png',
    whatsappSenderNumber: '254712345678'
  }
};

const mockBooking = {
  reference: 'FL-9912',
  customerName: 'Sarah Wanjiku',
  phone: '0712345678',
  email: 'sarah@example.com',
  date: '2026-10-28',
  startTime: '14:00',
  endTime: '15:30'
};

const mockService = {
  name: 'Sisterlocks Retightening',
  price: 4500,
  duration: 90
};

const gCal = generateGoogleCalendarUrl(mockTenant as any, mockBooking as any, mockService as any, 'Beatrice');
console.log('Google Calendar Link Generated:');
console.log(gCal);

const layoutSource = fs.readFileSync(path.join(templatesDir, 'layout.hbs'), 'utf8');
const layout = Handlebars.compile(layoutSource);

const templates = [
  'booking_confirmed',
  'booking_rescheduled',
  'booking_request_received',
  'booking_cancelled',
  'admin_new_booking',
  'password_reset'
];

for (const t of templates) {
  const source = fs.readFileSync(path.join(templatesDir, `${t}.hbs`), 'utf8');
  const compiled = Handlebars.compile(source);
  const body = compiled({
    tenant: mockTenant,
    booking: mockBooking,
    service: mockService,
    attendantName: 'Beatrice',
    formattedDate: 'Wednesday, 28 October 2026',
    formattedPrice: 'KES 4,500',
    durationLabel: '1 hr 30 mins',
    googleCalendarUrl: gCal,
    whatsAppUrl: 'https://wa.me/254712345678',
    customerWhatsAppUrl: 'https://wa.me/254712345678',
    bookingViewUrl: 'https://booking-app.com/flo-sisterlocks?ref=FL-9912',
    rescheduleUrl: 'https://booking-app.com/flo-sisterlocks?ref=FL-9912&action=reschedule',
    salonUrl: 'https://booking-app.com/flo-sisterlocks',
    adminUrl: 'https://booking-app.com/flo-sisterlocks/admin',
    resetUrl: 'https://booking-app.com/reset?token=xyz',
    reason: 'Stylist emergency',
    brandColor: '#C4466F'
  });
  const fullHtml = layout({ tenant: mockTenant, brandColor: '#C4466F', body });
  console.log(`[PASS] ${t}.hbs -> rendered ${fullHtml.length} characters`);
}
