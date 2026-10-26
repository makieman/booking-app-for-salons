import cron from 'node-cron';
import { DateTime } from 'luxon';
import Booking from '../models/Booking';
import Tenant from '../models/Tenant';
import { sendWhatsAppReminder } from './whatsappService';
import { sendAppointmentReminderSms } from './smsService';

/**
 * Runs daily at 09:00 Nairobi time (06:00 UTC).
 * Iterates over ALL active tenants and sends WhatsApp reminders for every
 * confirmed booking happening tomorrow — multi-tenant aware.
 *
 * WhatsApp sender identity (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID) is
 * shared across all tenants — per-tenant sender config is a future task.
 */
export function startReminderScheduler(): void {
  cron.schedule('0 9 * * *', async () => {
    console.log('[reminderService] 🔔 Running daily reminder job...');

    const tomorrow = DateTime.now().setZone('Africa/Nairobi').plus({ days: 1 }).toFormat('yyyy-MM-dd');

    try {
      const tenants = await Tenant.find({ isActive: true }).select('_id slug timezone name smsEnabled supportPhone');

      console.log(`[reminderService] Processing ${tenants.length} active tenant(s) for ${tomorrow}`);

      for (const tenant of tenants) {
        try {
          const bookings = await Booking.find({
            tenantId: tenant._id,
            date: tomorrow,
            status: 'confirmed',
          })
            .populate('serviceId')
            .populate('attendantId', 'name');

          console.log(`[reminderService] Tenant "${tenant.slug}": ${bookings.length} reminder(s) to send`);

          // One SMS per booking reference (multi-service bookings share a reference).
          const smsSentFor = new Set<string>();

          for (const booking of bookings) {
            const service      = booking.serviceId as any;
            const attendantName = (booking.attendantId as any)?.name;
            void sendWhatsAppReminder(booking, service, attendantName);

            if (tenant.smsEnabled && service && !smsSentFor.has(booking.reference)) {
              smsSentFor.add(booking.reference);
              // Awaited one at a time so the daily spend caps are checked accurately.
              await sendAppointmentReminderSms(tenant, booking, service, attendantName);
            }
          }
        } catch (tenantErr) {
          // One tenant failing must not stop reminders for other tenants
          console.error(`[reminderService] ❌ Error processing tenant "${tenant.slug}":`, tenantErr);
        }
      }
    } catch (err) {
      console.error('[reminderService] ❌ Reminder job failed:', err);
    }
  }, { timezone: 'Africa/Nairobi' });

  console.log('[reminderService] ✅ Daily reminder scheduler started (runs 09:00 EAT)');
}
