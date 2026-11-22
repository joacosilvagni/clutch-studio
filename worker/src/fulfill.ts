import type { Deps } from './env';
import { newToken, sha256Hex } from './crypto';
import { sendDownloadEmail, type DownloadLink } from './mail';

export interface OrderRow {
  id: string;
  paypal_order_id: string | null;
  capture_id: string | null;
  status: string;
  total_cents: number;
  items_json: string;
  payer_email: string | null;
}

export function settings(deps: Deps) {
  const ttlHours = Number(deps.env.DOWNLOAD_TTL_HOURS ?? '72');
  const maxDownloads = Number(deps.env.DOWNLOAD_MAX ?? '5');
  return { ttlHours, maxDownloads };
}

/** Creates one token per file of every item in the order. Returns the links (shown once, never stored). */
export async function issueTokens(deps: Deps, order: OrderRow): Promise<DownloadLink[]> {
  const { ttlHours, maxDownloads } = settings(deps);
  const now = deps.now();
  const expires = now + ttlHours * 3600 * 1000;
  const items = JSON.parse(order.items_json) as { slug: string; title: string }[];
  const links: DownloadLink[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const item of items) {
    // Files come from the catalog compiled into this deploy, not from the stored order.
    const product = deps.catalog.products[item.slug];
    for (const file of product?.files ?? []) {
      const token = newToken();
      stmts.push(
        deps.env.DB.prepare(
          `INSERT INTO download_tokens (token_hash, order_id, product_slug, r2_key, file_name, expires_at, remaining, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        ).bind(await sha256Hex(token), order.id, item.slug, file.r2_key, file.name, expires, maxDownloads, now),
      );
      links.push({ title: item.title, file_name: file.name, url: `${deps.env.SITE_URL}/d/${token}` });
    }
  }
  if (stmts.length) await deps.env.DB.batch(stmts);
  return links;
}

/**
 * Marks the order PAID exactly once and delivers. Called from the browser capture path and from
 * the webhook; whichever arrives second gets `null` and does nothing.
 */
export async function fulfillOnce(deps: Deps, order: OrderRow, captureId: string, payerEmail: string | null): Promise<DownloadLink[] | null> {
  const now = deps.now();
  const won = await deps.env.DB.prepare(
    `UPDATE orders SET status = 'PAID', capture_id = ?1, payer_email = COALESCE(?2, payer_email), paid_at = ?3, updated_at = ?3
     WHERE id = ?4 AND status IN ('CREATED', 'PENDING') RETURNING id`,
  )
    .bind(captureId, payerEmail, now, order.id)
    .first<{ id: string }>();
  if (!won) return null;
  const links = await issueTokens(deps, order);
  const email = payerEmail ?? order.payer_email;
  if (email) deps.waitUntil(deliverEmail(deps, order.id, email, links, `order-${order.id}`));
  return links;
}

export async function deliverEmail(deps: Deps, orderId: string, to: string, links: DownloadLink[], idempotencyKey: string): Promise<void> {
  const { ttlHours, maxDownloads } = settings(deps);
  const ok = await sendDownloadEmail(deps.env, deps.fetch, { to, orderId, links, expiresHours: ttlHours, maxDownloads, idempotencyKey });
  await deps.env.DB.prepare(`UPDATE orders SET email_status = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(ok ? 'sent' : 'failed', deps.now(), orderId)
    .run();
}

export async function revokeOrder(deps: Deps, orderId: string, status: 'REFUNDED' | 'REVERSED'): Promise<void> {
  const now = deps.now();
  await deps.env.DB.batch([
    deps.env.DB.prepare(`UPDATE orders SET status = ?1, updated_at = ?2 WHERE id = ?3`).bind(status, now, orderId),
    deps.env.DB.prepare(`UPDATE download_tokens SET revoked = 1 WHERE order_id = ?1`).bind(orderId),
  ]);
}

export async function orderBy(deps: Deps, column: 'id' | 'paypal_order_id' | 'capture_id', value: string): Promise<OrderRow | null> {
  return deps.env.DB.prepare(`SELECT * FROM orders WHERE ${column} = ?1`).bind(value).first<OrderRow>();
}
