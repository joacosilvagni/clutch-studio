import type { Deps } from '../env';
import { HttpError, html, escapeHtml, clientIp } from '../http';
import { rateLimit } from '../ratelimit';
import { sha256Hex, TOKEN_RE } from '../crypto';

interface TokenRow {
  order_id: string;
  product_slug: string;
  r2_key: string;
  file_name: string;
  expires_at: number;
  remaining: number;
  revoked: number;
}

function page(title: string, body: string, status = 200): Response {
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Clutch Studio</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#1d1d1b}button{font:inherit;padding:.7rem 1.4rem;border:0;border-radius:6px;background:#1d1d1b;color:#fff;cursor:pointer}.muted{color:#666}</style></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`,
    status,
  );
}

const gone = () =>
  page('Link expired', `<p>This download link has expired, was used up or was revoked.</p><p><a href="/downloads/">Request fresh links</a> with the email you paid with.</p>`, 410);

/**
 * GET shows a confirmation page and never consumes a download: mail scanners and link
 * previews fetch GET links. The download itself is a POST from that page.
 */
export async function downloadPage(token: string, deps: Deps): Promise<Response> {
  if (!TOKEN_RE.test(token)) return gone();
  const row = await deps.env.DB.prepare(
    `SELECT file_name, expires_at, remaining, revoked FROM download_tokens WHERE token_hash = ?1`,
  )
    .bind(await sha256Hex(token))
    .first<TokenRow>();
  if (!row || row.revoked || row.remaining <= 0 || row.expires_at <= deps.now()) return gone();
  const hours = Math.max(1, Math.round((row.expires_at - deps.now()) / 3600000));
  return page(
    'Your download',
    `<p><strong>${escapeHtml(row.file_name)}</strong></p>
<form method="post"><button type="submit">Download file</button></form>
<p class="muted">${row.remaining} download(s) left · link valid for about ${hours} more hour(s).</p>`,
  );
}

export async function downloadFile(req: Request, token: string, deps: Deps): Promise<Response> {
  await rateLimit(deps.env.DB, `download:${clientIp(req)}`, 30, 60, deps.now());
  if (!TOKEN_RE.test(token)) return gone();
  const hash = await sha256Hex(token);
  const now = deps.now();
  // Atomic: the decrement only happens if the token is still valid.
  const row = await deps.env.DB.prepare(
    `UPDATE download_tokens SET remaining = remaining - 1
     WHERE token_hash = ?1 AND revoked = 0 AND remaining > 0 AND expires_at > ?2
     RETURNING order_id, product_slug, r2_key, file_name, remaining`,
  )
    .bind(hash, now)
    .first<TokenRow>();
  if (!row) return gone();

  const object = await deps.env.FILES.get(row.r2_key);
  if (!object) {
    await deps.env.DB.prepare(`UPDATE download_tokens SET remaining = remaining + 1 WHERE token_hash = ?1`).bind(hash).run();
    console.error('r2_missing', row.r2_key);
    throw new HttpError(503, 'file_unavailable', 'The file is temporarily unavailable. Your download was not counted.');
  }
  // Delivery evidence for PayPal disputes.
  deps.waitUntil(
    deps.env.DB.prepare(`INSERT INTO download_log (token_hash, order_id, ts, ip, country, user_agent) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(hash, row.order_id, now, clientIp(req), req.headers.get('cf-ipcountry'), (req.headers.get('user-agent') ?? '').slice(0, 300))
      .run(),
  );
  const safeName = row.file_name.replace(/[^A-Za-z0-9._-]/g, '_');
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(object.size),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
