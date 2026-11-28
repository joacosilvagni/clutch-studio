import { priceToCents } from './schema.mjs';

// Physical goods ship only here (UK excluded at launch: VAT registration from the first sale).
export const SHIP_DESTINATIONS = ['US', 'EU', 'AU'];
// Floor agreed with Joaquín: every physical product nets at least USD 10 per order after the most
// expensive shipping route and PayPal's fee (international rate, 5.4% + USD 0.30).
export const MIN_NET_CENTS = 1000;
const paypalFeeCents = (cents) => Math.ceil(cents * 0.054) + 30;
const costCents = (v) => (v == null ? null : priceToCents(String(v)));

/**
 * Net per order on the worst route, or null when the supplier block lacks costs.
 * Shipping is included in the price, so the buyer pays price_usd to every destination.
 */
export function worstNetCents(p) {
  const price = priceToCents(p.price_usd);
  const cost = costCents(p.supplier?.cost_usd);
  const routes = Object.entries(p.supplier?.shipping ?? {}).filter(([d]) => SHIP_DESTINATIONS.includes(d));
  const ship = routes.map(([, s]) => costCents(s?.cost_usd));
  if (price == null || cost == null || !ship.length || ship.some((s) => s == null)) return null;
  return price - paypalFeeCents(price) - cost - Math.max(...ship);
}

/** What the Worker needs to sell and fulfill a physical product. Supplier data never reaches the site. */
function physicalEntry(p) {
  if (p.test === true) return { kind: 'physical', ship_to: [...SHIP_DESTINATIONS], supplier: null };
  const sp = p.supplier ?? {};
  const ship_to = SHIP_DESTINATIONS.filter((d) => sp.shipping?.[d]);
  const problems = [];
  if (!ship_to.length) problems.push('sin supplier.shipping para US, EU o AU');
  if (!sp.product_url) problems.push('sin supplier.product_url');
  const net = worstNetCents(p);
  if (net == null) problems.push('faltan costos en supplier (cost_usd y shipping.*.cost_usd)');
  else if (net < MIN_NET_CENTS) problems.push(`gana USD ${(net / 100).toFixed(2)} en la ruta más cara (mínimo ${(MIN_NET_CENTS / 100).toFixed(2)})`);
  if (problems.length) throw new Error(`${p.slug}: ${problems.join('; ')}`);
  const shipping = Object.fromEntries(ship_to.map((d) => [d, { method: sp.shipping[d].method ?? null, cost_usd: String(sp.shipping[d].cost_usd) }]));
  return {
    kind: 'physical',
    ship_to,
    supplier: {
      platform: sp.platform ?? null,
      product_url: sp.product_url,
      pid: sp.pid != null ? String(sp.pid) : null,
      variant: sp.variant ?? null,
      cost_usd: String(sp.cost_usd),
      shipping,
    },
  };
}

/**
 * Minimal, sellable view of the catalog for the Worker. A pack resolves to the files of
 * its members; the buyer gets one download link per file. Physical products carry where they
 * ship and how to buy them from the supplier.
 */
export function buildWorkerCatalog(products, { includeTest = false } = {}) {
  // Free Library items are never sold, so the Worker does not know them.
  // Sandbox-only test products (test: true) are included only when includeTest is set.
  const sellable = (p) => (p.status === 'approved' || (includeTest && p.test === true)) && p.free !== true;
  const approved = products.filter(sellable);
  const bySlug = new Map(approved.map((p) => [p.slug, p]));
  const out = {};
  for (const p of approved) {
    const base = { slug: p.slug, title: p.title, price_cents: priceToCents(p.price_usd) };
    if (p.kind === 'physical') {
      out[p.slug] = { ...base, files: [], ...physicalEntry(p) };
      continue;
    }
    const members = p.kind === 'pack' ? p.includes.map((s) => bySlug.get(s)) : [p];
    const files = members.flatMap((m) => (m.files ?? []).map((f) => ({ r2_key: f.r2_key, name: f.name ?? f.r2_key.split('/').pop() })));
    out[p.slug] = { ...base, files };
  }
  return { currency: 'USD', products: out };
}
