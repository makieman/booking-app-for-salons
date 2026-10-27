import cron from 'node-cron';
import { DateTime } from 'luxon';
import Booking from '../models/Booking';
import Tenant from '../models/Tenant';
import { sendWhatsAppReminder } from './whatsappService';
import { sendAppointmentReminderSms } from './smsService';

/** Reminders only go out during daytime in the salon's own timezone. */
export const REMINDER_FROM_HOUR = 8;
export const REMINDER_UNTIL_HOUR = 20; // exclusive: last run is the 19:00 tick

const DEFAULT_TIMEZONE = 'Africa/Nairobi';

/** True when `localNow` (already in the salon's timezone) is inside the daytime sending window. */
export function isWithinReminderWindow(localNow: DateTime): boolean {
  return localNow.hour >= REMINDER_FROM_HOUR && localNow.hour < REMINDER_UNTIL_HOUR;
}

/** Tomorrow's date (YYYY-MM-DD) as seen in the salon's own timezone. */
export function tomorrowKey(localNow: DateTime): string {
  return localNow.plus({ days: 1 }).toFormat('yyyy-MM-dd');
}

function localTimeFor(timezone: string | undefined, nowUtc: DateTime): DateTime {
  const zoned = nowUtc.setZone(timezone || DEFAULT_TIMEZONE);
  return zoned.isValid ? zoned : nowUtc.setZone(DEFAULT_TIMEZONE);
}

/**
 * One reminder pass. Safe to run as often as you like:
 *  - Every confirmed booking for TOMORROW (in the salon's timezone) that has not been
 *    reminded yet is picked up, so a booking confirmed at 2pm today still gets its reminder,
 *    and a missed run (server asleep or restarting) is caught up on the next one.
 *  - Each booking is claimed atomically (reminderSentAt) BEFORE anything is sent, so the same
 *    booking is never reminded twice, even if two runs overlap.
 *  - Only runs between 08:00 and 20:00 salon time, so nobody is texted at 3am.
 *
 * Multi-tenant aware. WhatsApp sender identity (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)
 * is shared across tenants — per-tenant sender config is a future task.
 */
export async function runReminderPass(nowUtc: DateTime = DateTime.utc()): Promise<void> {
  try {
    const tenants = await Tenant.find({ isActive: true }).select('_id slug timezone name smsEnabled supportPhone');

    for (const tenant of tenants) {
      try {
        const localNow = localTimeFor(tenant.timezone, nowUtc);
        if (!isWithinReminderWindow(localNow)) continue;

        const tomorrow = tomorrowKey(localNow);
        const bookings = await Booking.find({
          tenantId: tenant._id,
          date: tomorrow,
          status: 'confirmed',
          reminderSentAt: null,
        })
          .populate('serviceId')
          .populate('attendantId', 'name');

        if (bookings.length === 0) continue;
        console.log(`[reminderService] Tenant "${tenant.slug}": ${bookings.length} reminder(s) due for ${tomorrow}`);

        // One SMS per booking reference (multi-service bookings share a reference).
        const smsSentFor = new Set<string>();

        for (const booking of bookings) {
          // Atomic claim: only the run that flips reminderSentAt from null sends the reminder.
          const claim = await Booking.updateOne(
            { _id: booking._id, status: 'confirmed', reminderSentAt: null },
            { $set: { reminderSentAt: new Date() } },
          );
          if (claim.modifiedCount === 0) continue;

          const service = booking.serviceId as any;
          const attendantName = (booking.attendantId as any)?.name;
          void sendWhatsAppReminder(booking, service, attendantName);

          if (tenant.smsEnabled && service && !smsSentFor.has(booking.reference)) {
            smsSentFor.add(booking.reference);
            // Awaited one at a time so credits and the daily spend caps are checked accurately.
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
}

/**
 * Runs the reminder pass at the top of every hour, plus once shortly after startup so a
 * server that was asleep (e.g. Render free tier) catches up straight away.
 */
export function startReminderScheduler(): void {
  cron.schedule('0 * * * *', () => {
    void runReminderPass();
  }, { timezone: DEFAULT_TIMEZONE });

  const startupCatchUp = setTimeout(() => void runReminderPass(), 30_000);
  startupCatchUp.unref();

  console.log('[reminderService] ✅ Reminder scheduler started (hourly, sends 08:00–20:00 salon time)');
}
