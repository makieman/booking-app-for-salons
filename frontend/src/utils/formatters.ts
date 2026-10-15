/**
 * Formatting helpers for prices, currency, and phone numbers.
 */

export function formatPrice(price: number, priceMax?: number | null): string {
  if (priceMax && priceMax > price) {
    return `KES ${price.toLocaleString()} – ${priceMax.toLocaleString()}`;
  }
  return `KES ${price.toLocaleString()}`;
}

export function formatPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return cleaned;
}
