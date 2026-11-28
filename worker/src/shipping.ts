// Where physical goods can ship, and the address PayPal collected.
// UK is excluded at launch (VAT registration from the first sale); see docs/DECISIONS.md.

import type { ShipDestination } from './env';

export type Destination = ShipDestination;

// EU-27 ISO 3166-1 alpha-2 codes as PayPal sends them (Greece is GR, not EL).
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

/** Maps a country code to our shipping zone, or null when we don't ship there. */
export function destinationFor(countryCode: string | null | undefined): Destination | null {
  const c = String(countryCode ?? '').toUpperCase();
  if (c === 'US') return 'US';
  if (c === 'AU') return 'AU';
  if (EU.has(c)) return 'EU';
  return null;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country_code: string;
}

const clip = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

/** Reads purchase_units[0].shipping from an Orders v2 response (approved or captured order). */
export function extractShipping(order: any): ShippingAddress | null {
  const sh = order?.purchase_units?.[0]?.shipping;
  const a = sh?.address;
  const country = clip(a?.country_code, 2)?.toUpperCase();
  const line1 = clip(a?.address_line_1, 300);
  if (!a || !country || !line1) return null;
  return {
    name: clip(sh?.name?.full_name, 300) ?? '',
    line1,
    line2: clip(a.address_line_2, 300),
    city: clip(a.admin_area_2, 120) ?? '',
    state: clip(a.admin_area_1, 300),
    postal_code: clip(a.postal_code, 60),
    country_code: country,
  };
}

export function formatAddress(a: ShippingAddress): string[] {
  return [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', '), a.country_code].filter(
    (l): l is string => !!l,
  );
}
