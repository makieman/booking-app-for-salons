/**
 * Timezone-aware date and time utilities for the salon booking platform.
 * Default timezone is 'Africa/Nairobi' (UTC+3) to ensure consistent date boundaries
 * across midnight transitions without relying on UTC toISOString().
 */

export const DEFAULT_TIMEZONE = 'Africa/Nairobi';

/**
 * Returns today's date in YYYY-MM-DD format for a given timezone.
 */
export function getTodayDateString(timeZone: string = DEFAULT_TIMEZONE): string {
  return formatDateInTimezone(new Date(), timeZone);
}

/**
 * Formats a Date object or timestamp into YYYY-MM-DD in the specified timezone.
 */
export function formatDateInTimezone(date: Date | number = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Returns current time in HH:mm 24-hour format in the specified timezone.
 */
export function getCurrentTimeString(timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/**
 * Formats a date string (YYYY-MM-DD) for display, e.g. "Thu, 15 Oct 2026" or "Thursday, October 15, 2026".
 */
export function formatDisplayDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }
): string {
  if (!dateString) return '—';
  // Append T00:00:00 to avoid UTC-offset shift when parsing pure YYYY-MM-DD
  const dateObj = new Date(`${dateString}T00:00:00`);
  return dateObj.toLocaleDateString('en-GB', options);
}

/**
 * Formats an ISO createdAt string or timestamp into a readable date, e.g. "15 Oct 2026".
 */
export function formatRequestedDate(dateString?: string): string {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
