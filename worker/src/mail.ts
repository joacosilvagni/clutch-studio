import type { Env } from './env';
import { escapeHtml } from './http';

export interface DownloadLink {
  title: string;
  file_name: string;
  url: string;
}

/** Sends the download email through Resend's REST API. Returns true when Resend accepted it. */
export async function sendDownloadEmail(
  env: Env,
  fetchImpl: typeof fetch,
  args: { to: string; orderId: string; links: DownloadLink[]; expiresHours: number; maxDownloads: number; idempotencyKey: string },
): Promise<boolean> {
  const { orderId, links, expiresHours, maxDownloads } = args;
  // Sandbox buyers have fake addresses and Resend's test sender only reaches the account owner,
  // so sandbox mail can be redirected. Never in live mode.
  const to = env.PAYPAL_ENV === 'sandbox' && env.MAIL_SANDBOX_TO ? env.MAIL_SANDBOX_TO : args.to;
  const items = links
    .map((l) => `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.title)} (${escapeHtml(l.file_name)})</a></li>`)
    .join('');
  const html = `<p>Thanks for your order at Clutch Studio.</p>
<p>Your files are ready. Each link works for ${expiresHours} hours and up to ${maxDownloads} downloads.</p>
<ul>${items}</ul>
<p>Lost the links later? Request new ones at <a href="${escapeHtml(env.SITE_URL)}/downloads/">${escapeHtml(env.SITE_URL)}/downloads/</a>.</p>
<p>If a part doesn't fit, reply to this email and we'll help.</p>
<p style="color:#666;font-size:12px">Order ${escapeHtml(orderId)}</p>`;
  const text = [
    'Thanks for your order at Clutch Studio.',
    `Each link works for ${expiresHours} hours and up to ${maxDownloads} downloads.`,
    ...links.map((l) => `- ${l.title} (${l.file_name}): ${l.url}`),
    `Order ${orderId}`,
  ].join('\n');
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: 'Your Clutch Studio downloads', html, text }),
    });
    return res.ok;
  } catch (err) {
    console.error('resend_failed', err instanceof Error ? err.message : err);
    return false;
  }
}
