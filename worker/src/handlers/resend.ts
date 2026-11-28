import type { Deps } from '../env';
import { HttpError, json, readJson, assertSameOrigin, clientIp } from '../http';
import { rateLimit } from '../ratelimit';
import { deliverEmail, issueTokens, type OrderRow } from '../fulfill';
import type { DownloadLink } from '../mail';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const LOOKBACK_DAYS = 30;

/**
 * "Lost my links": issues fresh tokens for recent paid orders and emails them ONLY to the
 * address that paid. The response is identical whether or not orders exist (no enumeration).
 */
export async function resendLinks(req: Request, deps: Deps): Promise<Response> {
  assertSameOrigin(req, deps.env.SITE_URL);
  await rateLimit(deps.env.DB, `resend:${clientIp(req)}`, 3, 3600, deps.now());
  const email = String((await readJson(req) as any)?.email ?? '').trim().toLowerCase();
  if (email.length > 320 || !EMAIL_RE.test(email)) throw new HttpError(400, 'invalid_email');
  await rateLimit(deps.env.DB, `resend-email:${email}`, 3, 3600, deps.now());

  const since = deps.now() - LOOKBACK_DAYS * 86400 * 1000;
  const { results } = await deps.env.DB.prepare(
    `SELECT * FROM orders WHERE lower(payer_email) = ?1 AND status = 'PAID' AND paid_at >= ?2 ORDER BY paid_at DESC LIMIT 10`,
  )
    .bind(email, since)
    .all<OrderRow>();
  if (results.length) {
    const links: DownloadLink[] = [];
    for (const order of results) {
      await deps.env.DB.prepare(`UPDATE download_tokens SET revoked = 1 WHERE order_id = ?1`).bind(order.id).run();
      links.push(...(await issueTokens(deps, order)));
    }
    // Physical-only orders have nothing to download.
    if (links.length) deps.waitUntil(deliverEmail(deps, results[0]!.id, email, links, `resend-${results[0]!.id}-${deps.now()}`));
  }
  return json({ ok: true, message: 'If we find recent orders for that email, fresh links are on their way.' }, 202);
}
