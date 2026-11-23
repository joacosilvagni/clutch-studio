import { priceToCents } from './schema.mjs';

/**
 * Minimal, sellable view of the catalog for the Worker. A pack resolves to the files of
 * its members; the buyer gets one download link per file.
 */
export function buildWorkerCatalog(products, { includeTest = false } = {}) {
  // Free Library items are never sold, so the Worker does not know them.
  // Sandbox-only test products (test: true) are included only when includeTest is set.
  const sellable = (p) =>
    (p.status === 'approved' || (includeTest && p.test === true)) && p.kind !== 'physical' && p.free !== true;
  const approved = products.filter(sellable);
  const bySlug = new Map(approved.map((p) => [p.slug, p]));
  const out = {};
  for (const p of approved) {
    const members = p.kind === 'pack' ? p.includes.map((s) => bySlug.get(s)) : [p];
    const files = members.flatMap((m) => (m.files ?? []).map((f) => ({ r2_key: f.r2_key, name: f.name ?? f.r2_key.split('/').pop() })));
    out[p.slug] = { slug: p.slug, title: p.title, price_cents: priceToCents(p.price_usd), files };
  }
  return { currency: 'USD', products: out };
}
