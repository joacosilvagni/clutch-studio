// Static taxonomy (makes, models, categories) and shared types.
// Products live in ../catalog/products/*.yaml and are loaded by src/data/products.ts.
// Keep model and category slugs in sync with pipeline/src/schema.mjs.

export type Make = { slug: string; name: string };

export type Model = {
  slug: string; // also the SEO route: /bmw-e30/
  make: string; // Make.slug
  name: string; // "E30"
  fullName: string; // "BMW 3 Series (E30)"
  years: [number, number];
  blurb: string;
};

export type Category = { slug: string; name: string; short: string; glyph: Glyph };
export type Glyph = 'clip' | 'gauge' | 'cup' | 'knob' | 'lamp' | 'engine' | 'tool' | 'panel';

// `physical` is reserved for the later dropshipping phase. Nothing uses it yet.
export type ProductKind = 'file' | 'pack' | 'physical';

// View model used by the pages. Built from the catalog YAML in src/data/products.ts.
export type Product = {
  slug: string;
  title: string;
  kind: ProductKind;
  models: string[]; // known Model.slug values; the first one is canonical
  fitYears: Record<string, [number, number]>; // per-model years from the catalog (may be narrower than the model)
  category: string;
  priceUsd: number | null; // null = not priced yet (drafts)
  summary: string | null;
  description: string | null;
  oem: string[];
  material: { recommended: string[]; avoid: string[]; note: string | null };
  print: {
    layer: string | null;
    infill: string | null;
    walls: number | null;
    supports: string | null;
    orientation: string | null;
    notes: string | null;
  };
  includes: string[];
  install: string[];
  sources: { url: string; author: string | null; authorUrl: string | null; license: string; licenseLabel: string; verified: boolean }[];
  status: 'draft' | 'approved';
  reviewFlags: string[];
};

export const makes: Make[] = [
  { slug: 'bmw', name: 'BMW' },
  { slug: 'mazda', name: 'Mazda' },
  { slug: 'volkswagen', name: 'Volkswagen' },
  { slug: 'mercedes-benz', name: 'Mercedes-Benz' },
  { slug: 'volvo', name: 'Volvo' },
  { slug: 'jeep', name: 'Jeep' },
  { slug: 'land-rover', name: 'Land Rover' },
  { slug: 'saab', name: 'Saab' },
  { slug: 'chevrolet', name: 'Chevrolet' },
];

export const models: Model[] = [
  { slug: 'bmw-e30', make: 'bmw', name: 'E30', fullName: 'BMW 3 Series (E30)', years: [1982, 1994], blurb: 'Dash clips, vent gauge pods and the small trim bits that crack after forty summers.' },
  { slug: 'bmw-e36', make: 'bmw', name: 'E36', fullName: 'BMW 3 Series (E36)', years: [1990, 2000], blurb: 'Fog light blanks, cupholders and workshop helpers for the E36.' },
  { slug: 'mazda-miata', make: 'mazda', name: 'MX-5 Miata NA/NB', fullName: 'Mazda MX-5 Miata (NA/NB)', years: [1989, 2005], blurb: 'Soft top buttons, gauge panels and small cabin parts.' },
  { slug: 'vw-beetle', make: 'volkswagen', name: 'Beetle (Type 1)', fullName: 'Volkswagen Beetle (Type 1)', years: [1938, 2003], blurb: 'Bezels, handles and helpers for the air-cooled classic.' },
  { slug: 'vw-bus-t2', make: 'volkswagen', name: 'Bus (Type 2, T2)', fullName: 'Volkswagen Type 2 Bus (T2)', years: [1967, 1979], blurb: 'Heater levers, dash cutouts and cabin upgrades for the Bay Window.' },
  { slug: 'vw-golf-mk1', make: 'volkswagen', name: 'Golf Mk1', fullName: 'Volkswagen Golf / Rabbit (Mk1)', years: [1974, 1983], blurb: 'Vent window bearings and headlight clips.' },
  { slug: 'vw-golf-mk2', make: 'volkswagen', name: 'Golf Mk2', fullName: 'Volkswagen Golf (Mk2)', years: [1983, 1992], blurb: 'Knobs, blanks and small interior parts.' },
  { slug: 'mercedes-w123', make: 'mercedes-benz', name: 'W123', fullName: 'Mercedes-Benz W123', years: [1976, 1986], blurb: 'Bushings, caps and grommets for the car that never dies.' },
  { slug: 'volvo-240', make: 'volvo', name: '240', fullName: 'Volvo 240 / 245', years: [1974, 1993], blurb: 'Door card clips, bezels and handle covers.' },
  { slug: 'jeep-cherokee-xj', make: 'jeep', name: 'Cherokee XJ', fullName: 'Jeep Cherokee (XJ)', years: [1984, 2001], blurb: 'Console latches, switch panels and cupholders.' },
  { slug: 'land-rover-defender', make: 'land-rover', name: 'Defender', fullName: 'Land Rover Defender', years: [1983, 2016], blurb: 'Handles and small fittings for the classic Defender.' },
  { slug: 'saab-900', make: 'saab', name: '900 (classic)', fullName: 'Saab 900 (classic)', years: [1978, 1994], blurb: 'Bushings, gauge panels and cabin parts.' },
  { slug: 'chevrolet-c10', make: 'chevrolet', name: 'C10 (Square Body)', fullName: 'Chevrolet C/K C10 (Square Body)', years: [1973, 1987], blurb: 'Bench seat cupholders, pull strap covers and knobs.' },
];

export const categories: Category[] = [
  { slug: 'clips-fasteners', name: 'Clips & fasteners', short: 'Clips', glyph: 'clip' },
  { slug: 'interior-trim', name: 'Interior trim & panels', short: 'Trim', glyph: 'panel' },
  { slug: 'gauge-pods-bezels', name: 'Gauge pods & bezels', short: 'Gauges', glyph: 'gauge' },
  { slug: 'knobs-handles-bushings', name: 'Knobs, handles & bushings', short: 'Knobs', glyph: 'knob' },
  { slug: 'storage-cupholders', name: 'Storage & cupholders', short: 'Storage', glyph: 'cup' },
  { slug: 'exterior-lighting', name: 'Exterior & lighting', short: 'Exterior', glyph: 'lamp' },
  { slug: 'engine-bay', name: 'Engine bay', short: 'Engine', glyph: 'engine' },
  { slug: 'workshop-tools', name: 'Workshop tools & jigs', short: 'Tools', glyph: 'tool' },
];

// ---------- helpers ----------
export const getMake = (slug: string) => makes.find((m) => m.slug === slug)!;
export const getModel = (slug: string) => models.find((m) => m.slug === slug)!;
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug)!;
export const modelsForMake = (slug: string) => models.filter((m) => m.make === slug);

export const yearsLabel = (m: Model) => `${m.years[0]}–${m.years[1]}`;
export const fitsLabel = (m: Model) => `${getMake(m.make).name} ${m.name} (${yearsLabel(m)})`;
// Label using the product's own fit years, e.g. "Jeep Cherokee XJ (1997–2001)".
export const productFitsLabel = (p: Product, m: Model) => {
  const y = p.fitYears[m.slug] ?? m.years;
  return `${getMake(m.make).name} ${m.name} (${y[0]}–${y[1]})`;
};
export const priceLabel = (p: Product) =>
  p.priceUsd == null ? 'Price TBD' : p.priceUsd === 0 ? 'Free' : `$${p.priceUsd.toFixed(2)}`;
