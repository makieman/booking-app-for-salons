import { DateTime } from 'luxon';
import Service, { IService } from '../models/Service';
import Booking from '../models/Booking';
import Attendant from '../models/Attendant';
import { ITenant } from '../models/Tenant';
import { generateAvailableSlots } from './slotService';
import { sendPushToAdmins } from './pushService';

export interface LiveSalonContext {
  salonName: string;
  bookingUrl: string;
  workingHours: { start: string; end: string };
  supportPhone?: string;
  supportEmail?: string;
  services: Array<{
    name: string;
    priceLabel: string;
    durationLabel: string;
    durationMinutes: number;
    description?: string;
  }>;
  stylists: string[];
  nextAvailableSlots: string[];
  activeBooking: {
    reference: string;
    customerName: string;
    serviceName: string;
    attendantName?: string;
    date: string;
    startTime: string;
    status: string;
  } | null;
}

function formatPriceKES(service: IService): string {
  const min = Number(service.price || 0).toLocaleString('en-KE');
  if (service.priceMax && service.priceMax > service.price) {
    const max = Number(service.priceMax).toLocaleString('en-KE');
    return `KES ${min} – ${max}`;
  }
  return `KES ${min}`;
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'}`;
  return `${mins} min`;
}

function formatSlotHuman(dateStr: string, timeStr: string): string {
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: 'Africa/Nairobi' });
  return dt.toFormat("EEE d MMM 'at' h:mm a");
}

/**
 * Queries live MongoDB data (Services, Prices, Stylists, Available Slots, and
 * Customer's Active Booking) for a tenant so the AI Receptionist never uses
 * stale or hardcoded information.
 */
export async function buildLiveSalonContext(
  tenant: ITenant,
  senderPhoneVariants: string[],
): Promise<LiveSalonContext> {
  const tenantId = tenant._id.toString();
  const baseUrl = (process.env.FRONTEND_URL || 'https://booking-app-for-salons.vercel.app').replace(/\/+$/, '');
  const bookingUrl = `${baseUrl}/${tenant.slug}`;

  const [rawServices, rawStylists, activeBookingDoc] = await Promise.all([
    Service.find({ tenantId: tenant._id }).sort({ price: 1 }).lean<IService[]>(),
    Attendant.find({ tenantId: tenant._id }).select('name').lean<Array<{ name: string }>>(),
    Booking.findOne({
      tenantId: tenant._id,
      phone: { $in: senderPhoneVariants },
      status: { $in: ['pending', 'confirmed'] },
    })
      .populate('serviceId')
      .populate('attendantId', 'name')
      .sort({ createdAt: -1 }),
  ]);

  const services = rawServices.map((s) => ({
    name: s.name,
    priceLabel: formatPriceKES(s),
    durationLabel: formatDuration(s.duration),
    durationMinutes: s.duration,
    description: s.description,
  }));

  const stylists = rawStylists.map((a) => a.name).filter(Boolean);

  // Compute next 5 available 60-min slots over the next 7 days
  const nextAvailableSlots: string[] = [];
  const today = DateTime.now().setZone(tenant.timezone || 'Africa/Nairobi');
  const workingHours = tenant.workingHours || { start: '09:00', end: '18:00' };
  const closedWeekdays = tenant.bookingRules?.closedWeekdays || [];
  const holidays = tenant.bookingRules?.holidays || [];

  for (let d = 1; d <= 7 && nextAvailableSlots.length < 5; d++) {
    const checkDt = today.plus({ days: d });
    const checkDate = checkDt.toFormat('yyyy-MM-dd');
    // Luxon weekday: 1=Mon..7=Sun -> JS weekday: 0=Sun..6=Sat
    const jsWeekday = checkDt.weekday === 7 ? 0 : checkDt.weekday;
    if (closedWeekdays.includes(jsWeekday) || holidays.includes(checkDate)) {
      continue;
    }

    const dayBookings = await Booking.find({
      tenantId: tenant._id,
      date: checkDate,
      status: { $in: ['pending', 'confirmed'] },
    }).lean();

    const slots = generateAvailableSlots(checkDate, 60, dayBookings as any, workingHours);
    for (const slot of slots.slice(0, 2)) {
      if (nextAvailableSlots.length < 5) {
        nextAvailableSlots.push(formatSlotHuman(checkDate, slot));
      }
    }
  }

  let activeBooking: LiveSalonContext['activeBooking'] = null;
  if (activeBookingDoc) {
    const svc = activeBookingDoc.serviceId as any;
    const att = activeBookingDoc.attendantId as any;
    activeBooking = {
      reference: activeBookingDoc.reference,
      customerName: activeBookingDoc.customerName,
      serviceName: svc?.name || 'Salon Appointment',
      attendantName: att?.name,
      date: activeBookingDoc.date,
      startTime: activeBookingDoc.startTime,
      status: activeBookingDoc.status,
    };
  }

  return {
    salonName: tenant.name || 'Flo Sisterlocks',
    bookingUrl,
    workingHours,
    supportPhone: tenant.supportPhone,
    supportEmail: tenant.supportEmail || tenant.ownerEmail,
    services,
    stylists,
    nextAvailableSlots,
    activeBooking,
  };
}

/**
 * Calls Google Gemini 2.5 Flash REST API grounded strictly on live MongoDB data.
 * Returns null if GEMINI_API_KEY is not configured or if the request fails.
 */
async function generateGeminiReply(
  customerMessage: string,
  ctx: LiveSalonContext,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const servicesBlock =
    ctx.services.length > 0
      ? ctx.services
          .map(
            (s) =>
              `- ${s.name}: ${s.priceLabel} (${s.durationLabel})${s.description ? ` — ${s.description}` : ''}`,
          )
          .join('\n')
      : 'No services listed currently.';

  const bookingBlock = ctx.activeBooking
    ? `Customer has an active booking:
- Name: ${ctx.activeBooking.customerName}
- Service: ${ctx.activeBooking.serviceName}${ctx.activeBooking.attendantName ? ` with ${ctx.activeBooking.attendantName}` : ''}
- Date & Time: ${ctx.activeBooking.date} at ${ctx.activeBooking.startTime}
- Status: ${ctx.activeBooking.status.toUpperCase()}
- Reference: ${ctx.activeBooking.reference}`
    : 'Customer has no active upcoming booking on this phone number.';

  const systemPrompt = `You are the official WhatsApp AI Receptionist for *${ctx.salonName}*.
Answer the customer's message warmly, concisely, and accurately using ONLY the live database facts below.

LIVE SALON DATABASE FACTS:
- Salon Name: ${ctx.salonName}
- Working Hours: ${ctx.workingHours.start} to ${ctx.workingHours.end} (East Africa Time)
- Specialist Stylists: ${ctx.stylists.length ? ctx.stylists.join(', ') : 'Our certified stylists'}
- Online Booking Link: ${ctx.bookingUrl}
${ctx.supportPhone ? `- Direct Salon Phone: ${ctx.supportPhone}\n` : ''}- Email: ${ctx.supportEmail || 'support@flosisterlocks.com'}

LIVE SERVICES & EXACT PRICES (IN KES):
${servicesBlock}

NEXT AVAILABLE TIME SLOTS:
${ctx.nextAvailableSlots.length ? ctx.nextAvailableSlots.map((s) => `- ${s}`).join('\n') : '- Visit our booking link to view real-time availability.'}

CUSTOMER'S CURRENT BOOKING STATUS:
${bookingBlock}

STRICT RULES:
1. Always start your reply with "*${ctx.salonName}*" on the first line.
2. NEVER invent or guess prices or services. Quote ONLY the exact KES prices from "LIVE SERVICES & EXACT PRICES" above.
3. Keep the message short, friendly, and easy to read on WhatsApp (use *bold* for service names and prices, and bullet points).
4. If the customer has an active booking, remind them they can reply *CONFIRM* (or *1*), *RESCHEDULE* (or *3*), or *CANCEL* (or *2*) anytime.
5. If they want to book a new appointment, share the Online Booking Link: ${ctx.bookingUrl}
6. Understand English, Swahili, and Sheng naturally.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const response = await fetch(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: customerMessage }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn(`[aiReceptionist] Gemini API returned HTTP ${response.status} — using live DB fallback`);
      return null;
    }

    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch (err) {
    console.warn('[aiReceptionist] Gemini request error — using live DB fallback:', err);
    return null;
  }
}

/**
 * Built-in Smart Database NLP Engine (Zero-cost fallback when GEMINI_API_KEY is not set).
 * Answers customer questions about prices, specific services, available slots, working hours,
 * and booking status directly from the live MongoDB context.
 */
function generateSmartDatabaseReply(customerMessage: string, ctx: LiveSalonContext): string {
  const lower = customerMessage.toLowerCase();

  // 1. Check if customer is asking about a specific service in the database
  const matchedServices = ctx.services.filter((s) => {
    const words = s.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    return words.some((w) => lower.includes(w));
  });

  const isAskingPriceOrServices =
    /price|cost|how much|bei|charge|rate|fee|service|menu|offer|list|install|retight|lock|facial|consult|style|wash|treat/i.test(
      lower,
    );
  const isAskingSlotsOrHours =
    /slot|availab|free|open|hour|time|when|tomorrow|today|kesho|saa|weekend|saturday|sunday|monday|tuesday|wednesday|thursday|friday|book/i.test(
      lower,
    );
  const isAskingMyBooking = /my booking|status|appoint|ref|lmn-|confirm|cancel|reschedul/i.test(lower);

  const lines: string[] = [`*${ctx.salonName}*`];

  if (matchedServices.length > 0) {
    lines.push(
      `\nHere ${matchedServices.length === 1 ? 'are the details' : 'are our live rates'} from our salon menu:\n`,
    );
    for (const s of matchedServices) {
      lines.push(
        `• *${s.name}* — *${s.priceLabel}* (${s.durationLabel})${s.description ? `\n  _${s.description}_` : ''}`,
      );
    }
    if (ctx.nextAvailableSlots.length > 0) {
      lines.push(`\n*Next Available Slots:*\n${ctx.nextAvailableSlots.slice(0, 3).map((s) => `• ${s}`).join('\n')}`);
    }
    lines.push(`\n📅 *Book online:* ${ctx.bookingUrl}`);
  } else if (isAskingPriceOrServices) {
    lines.push(`\nHere is our current *Services & Price List*:\n`);
    if (ctx.services.length > 0) {
      for (const s of ctx.services) {
        lines.push(`• *${s.name}*: *${s.priceLabel}* (${s.durationLabel})`);
      }
    } else {
      lines.push(`Please visit ${ctx.bookingUrl} to view our current services.`);
    }
    lines.push(`\n🕒 *Working Hours:* ${ctx.workingHours.start} – ${ctx.workingHours.end}`);
    lines.push(`📅 *Book an appointment:* ${ctx.bookingUrl}`);
  } else if (isAskingSlotsOrHours) {
    lines.push(`\n🕒 *Opening Hours:* ${ctx.workingHours.start} – ${ctx.workingHours.end}`);
    if (ctx.nextAvailableSlots.length > 0) {
      lines.push(`\n*Next Available Appointment Slots:*\n${ctx.nextAvailableSlots.map((s) => `• ${s}`).join('\n')}`);
    }
    lines.push(`\n📅 *Pick your time slot here:* ${ctx.bookingUrl}`);
  } else if (isAskingMyBooking && ctx.activeBooking) {
    const b = ctx.activeBooking;
    lines.push(
      `\n📋 *Your Active Appointment:*\n• *Service:* ${b.serviceName}${b.attendantName ? ` with ${b.attendantName}` : ''}\n• *Date & Time:* ${b.date} at ${b.startTime}\n• *Status:* ${b.status.toUpperCase()}\n• *Reference:* ${b.reference}`,
    );
    lines.push(
      `\nReply with:\n• *CONFIRM* (or *1*) to confirm\n• *RESCHEDULE* (or *3*) for new slots\n• *CANCEL* (or *2*) to cancel`,
    );
  } else {
    // Welcoming overview with live services + active booking if present
    lines.push(`\nHi${ctx.activeBooking ? ` ${ctx.activeBooking.customerName}` : ''}! 👋 Welcome to *${ctx.salonName}*.`);

    if (ctx.services.length > 0) {
      lines.push(`\n✨ *Our Services & Live Prices:*`);
      for (const s of ctx.services) {
        lines.push(`• *${s.name}*: *${s.priceLabel}* (${s.durationLabel})`);
      }
    }

    if (ctx.activeBooking) {
      const b = ctx.activeBooking;
      lines.push(
        `\n📋 *Your Active Booking (${b.reference}):*\n${b.serviceName} on *${b.date}* at *${b.startTime}* (${b.status.toUpperCase()})`,
      );
      lines.push(
        `\n*Quick Actions:*\n• Reply *CONFIRM* (or *1*) to confirm\n• Reply *RESCHEDULE* (or *3*) to change time\n• Reply *CANCEL* (or *2*) to cancel`,
      );
    } else {
      if (ctx.nextAvailableSlots.length > 0) {
        lines.push(
          `\n🗓️ *Next Available Slots:*\n${ctx.nextAvailableSlots.slice(0, 3).map((s) => `• ${s}`).join('\n')}`,
        );
      }
      lines.push(`\n📅 *Book online 24/7:* ${ctx.bookingUrl}`);
    }
  }

  return lines.join('\n');
}

/**
 * Main entry point called by webhookController when a customer sends a free-text
 * question or message on WhatsApp.
 */
export async function handleCustomerQuestionWithAI(
  customerMessage: string,
  tenant: ITenant,
  senderPhone: string,
  senderPhoneVariants: string[],
): Promise<string> {
  const ctx = await buildLiveSalonContext(tenant, senderPhoneVariants);

  // Notify salon admin via Web Push so the owner also sees customer inquiries in real time
  void sendPushToAdmins(
    {
      title: `💬 WhatsApp Question (${ctx.activeBooking?.customerName || senderPhone})`,
      body: `"${customerMessage.slice(0, 100)}"`,
      url: '/admin',
    },
    tenant._id.toString(),
  );

  // 1. Try Gemini 2.5 Flash grounded on live MongoDB data
  const aiReply = await generateGeminiReply(customerMessage, ctx);
  if (aiReply) {
    return aiReply;
  }

  // 2. Fallback to built-in Smart Database NLP Engine
  return generateSmartDatabaseReply(customerMessage, ctx);
}
