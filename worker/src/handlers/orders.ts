import type { Deps } from '../env';
import { HttpError, json, readJson, assertSameOrigin, clientIp } from '../http';
import { rateLimit } from '../ratelimit';
import { createPayPal } from '../paypal';
import { createFulfillment, isPhysical } from '../shipments';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ITEMS = 20;

/** Accepts { items: [{ slug, qty? }] } — slugs only; prices are never read from the client. */
export function parseCart(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as any).items)) throw new HttpError(400, 'invalid_cart');
  const raw = (body as any).items as unknown[];
  if (raw.length === 0 || raw.length > MAX_ITEMS) throw new HttpError(400, 'invalid_cart', `1 to ${MAX_ITEMS} items`);
  const slugs = new Set<string>();
  for (const it of raw) {
    const slug = typeof it === 'string' ? it : (it as any)?.slug;
    if (typeof slug !== 'string' || slug.length > 100 || !SLUG_RE.test(slug)) throw new HttpError(400, 'invalid_cart');
    slugs.add(slug); // one of each for now (files and physical items alike); duplicates collapse
  }
  return [...slugs];
}

export async function createOrder(req: Request, deps: Deps): Promise<Response> {
  assertSameOrigin(req, deps.env.SITE_URL);
  await rateLimit(deps.env.DB, `orders:${clientIp(req)}`, 10, 60, deps.now());
  const slugs = parseCart(await readJson(req));
  const items = slugs.map((slug) => {
    const p = deps.catalog.products[slug];
    if (!p || p.price_cents <= 0) throw new HttpError(400, 'unknown_product', `Unknown product: ${slug}`);
    return { slug: p.slug, title: p.title, price_cents: p.price_cents, ...(isPhysical(p) ? { physical: true } : {}) };
  });
  const total = items.reduce((s, i) => s + i.price_cents, 0);
  const id = crypto.randomUUID();
  const now = deps.now();
  await deps.env.DB.prepare(
    `INSERT INTO orders (id, status, total_cents, items_json, created_at, updated_at) VALUES (?1, 'CREATED', ?2, ?3, ?4, ?4)`,
  )
    .bind(id, total, JSON.stringify(items), now)
    .run();
  const physical = items.filter((i) => i.physical).map((i) => ({ slug: i.slug, title: i.title, qty: 1 }));
  if (physical.length) await createFulfillment(deps, id, physical);
  const paypalOrderId = await createPayPal(deps.env, deps.fetch, deps.now).createOrder(id, items, total);
  await deps.env.DB.prepare(`UPDATE orders SET paypal_order_id = ?1, updated_at = ?2 WHERE id = ?3`).bind(paypalOrderId, now, id).run();
  return json({ id: paypalOrderId });
}
