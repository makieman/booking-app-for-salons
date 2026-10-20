/**
 * Per-salon brand colour handling.
 *
 * A salon can choose its own primary colour in Admin Settings. Rather than
 * painting that raw value onto buttons (a pale colour would make white button
 * text unreadable), we keep the salon's hue and derive tokens that still meet
 * WCAG AA contrast. The derived values are written to CSS variables that the
 * theme in index.css declares, so every `bg-primary`, `hover:bg-primary-hover`
 * and similar utility follows the salon automatically.
 */

/** Default brand colour of the built-in "Terracotta & Espresso" palette (see index.css). */
export const DEFAULT_PRIMARY = '#8C4A32';

/** Previous defaults. Tenants that never customised their colour have this saved. */
const LEGACY_DEFAULT_PRIMARY = '#B08968';
const LEGACY_DEFAULT_PRIMARY_V2 = '#9A5532';

// Fixed palette colours the derived tokens are checked against.
const INK = '#231F1D'; // main text colour, used as the label on accent buttons
const DARK_SURFACE = '#2C221E'; // dark espresso booking bar, the surface accent buttons sit on
const WHITE = '#FFFFFF';
const BLACK = '#000000';

type RGB = [number, number, number];

function parse(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1 to 21). */
function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear mix: t = 0 returns a, t = 1 returns b. */
function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as RGB;
}

export interface BrandTokens {
  primary: string;
  primaryHover: string;
  primaryTint: string;
  primaryInk: string;
  accent: string;
  accentHover: string;
}

/**
 * True when the salon has no custom colour, or still has the old default,
 * in which case the palette defaults from index.css should apply untouched.
 */
export function usesDefaultBrand(hex?: string | null): boolean {
  if (!hex) return true;
  const normalised = hex.trim().toUpperCase();
  return normalised === LEGACY_DEFAULT_PRIMARY || normalised === LEGACY_DEFAULT_PRIMARY_V2 || normalised === DEFAULT_PRIMARY || parse(normalised) === null;
}

/**
 * Derives accessible tokens from a salon's chosen colour:
 *  - primary:      darkened as needed so white button text reaches 4.5:1
 *  - primaryHover: darker still
 *  - primaryTint:  very light wash for selected cards
 *  - primaryInk:   brand-coloured text that reads on that tint (4.5:1)
 *  - accent:       lightened version for buttons on the dark booking bar,
 *                  with INK label text at 4.5:1 and 3:1 against the bar
 */
export function deriveBrandTokens(hex: string): BrandTokens | null {
  const base = parse(hex);
  if (!base) return null;
  const white = parse(WHITE)!;
  const black = parse(BLACK)!;
  const ink = parse(INK)!;
  const dark = parse(DARK_SURFACE)!;

  let primary = base;
  for (let i = 0; i < 40 && contrast(primary, white) < 4.5; i++) primary = mix(primary, black, 0.06);

  const primaryHover = mix(primary, black, 0.18);
  const primaryTint = mix(primary, white, 0.9);

  let primaryInk = primary;
  for (let i = 0; i < 40 && contrast(primaryInk, primaryTint) < 4.5; i++) primaryInk = mix(primaryInk, black, 0.06);

  let accent = mix(base, white, 0.45);
  for (let i = 0; i < 20 && (contrast(ink, accent) < 4.5 || contrast(accent, dark) < 3); i++) {
    accent = mix(accent, white, 0.1);
  }
  const accentHover = mix(accent, white, 0.25);

  return {
    primary: toHex(primary),
    primaryHover: toHex(primaryHover),
    primaryTint: toHex(primaryTint),
    primaryInk: toHex(primaryInk),
    accent: toHex(accent),
    accentHover: toHex(accentHover),
  };
}
