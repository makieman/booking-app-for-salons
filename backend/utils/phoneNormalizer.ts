/**
 * Normalizes Kenyan phone numbers to E.164 format (+254XXXXXXXXX).
 *
 * Supported Kenyan formats:
 * - 07xx xxx xxx / 01xx xxx xxx (10 digits) -> +2547xxxxxxxx / +2541xxxxxxxx
 * - 7xx xxx xxx / 1xx xxx xxx   (9 digits)  -> +2547xxxxxxxx / +2541xxxxxxxx
 * - 2547xxxxxxxx / 2541xxxxxxxx (12 digits) -> +2547xxxxxxxx / +2541xxxxxxxx
 * - +2547xxxxxxxx / +2541xxxxxxxx (13 chars)-> +2547xxxxxxxx / +2541xxxxxxxx
 *
 * Handles whitespace, hyphens, parentheses, and dots.
 * Returns null if the input is not a valid Kenyan phone number.
 */
export function normalizeKenyanPhone(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strip all whitespace, hyphens, parentheses, dots, and common separators
  const cleaned = raw.trim().replace(/[\s\-().]/g, '');

  // +254 7xx or +254 1xx (13 chars: +254 followed by 7 or 1 and 8 digits)
  if (/^\+254[71]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // 254 7xx or 254 1xx (12 digits)
  if (/^254[71]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // 07xx or 01xx (10 digits)
  if (/^0[71]\d{8}$/.test(cleaned)) {
    return `+254${cleaned.slice(1)}`;
  }

  // 7xx or 1xx (9 digits)
  if (/^[71]\d{8}$/.test(cleaned)) {
    return `+254${cleaned}`;
  }

  return null;
}
