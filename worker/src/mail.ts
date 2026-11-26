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
  const to = buyerAddress(env, args.to);
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
  return sendMail(env, fetchImpl, { to, subject: 'Your Clutch Studio downloads', html, text, idempotencyKey: args.idempotencyKey });
}

/** Low-level send through Resend. `to` is used as given (callers apply the sandbox redirect). */
export async function sendMail(
  env: Env,
  fetchImpl: typeof fetch,
  m: { to: string; subject: string; html: string; text: string; idempotencyKey: string },
): Promise<boolean> {
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': m.idempotencyKey,
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    return res.ok;
  } catch (err) {
    console.error('resend_failed', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Buyer mail goes to MAIL_SANDBOX_TO in sandbox (fake PayPal sandbox addresses), never in live. */
export function buyerAddress(env: Env, to: string): string {
  return env.PAYPAL_ENV === 'sandbox' && env.MAIL_SANDBOX_TO ? env.MAIL_SANDBOX_TO : to;
}

/** Where operational mail (orders to buy, alerts) goes. Null = nobody configured; the data stays in D1. */
export function opsAddress(env: Env): string | null {
  if (env.ORDER_NOTIFY_TO) return env.ORDER_NOTIFY_TO;
  return env.PAYPAL_ENV === 'sandbox' && env.MAIL_SANDBOX_TO ? env.MAIL_SANDBOX_TO : null;
}

const list = (lines: string[]) => `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
const lines = (ls: string[]) => ls.map(escapeHtml).join('<br>');

/** Sent to the buyer after payment when the order has physical items. Promises no delivery time. */
export function orderConfirmationEmail(a: { orderId: string; items: string[]; address: string[] }) {
  const html = `<p>Thanks for your order at Clutch Studio. Your payment is confirmed.</p>
<p>We're preparing the following to ship:</p>
${list(a.items)}
<p>Shipping to:<br>${lines(a.address)}</p>
<p>We'll email you the tracking number as soon as your order ships. If anything looks wrong, reply to this email.</p>
<p style="color:#666;font-size:12px">Order ${escapeHtml(a.orderId)}</p>`;
  const text = [
    'Thanks for your order at Clutch Studio. Your payment is confirmed.',
    "We're preparing the following to ship:",
    ...a.items.map((i) => `- ${i}`),
    '',
    'Shipping to:',
    ...a.address,
    '',
    "We'll email you the tracking number as soon as your order ships. If anything looks wrong, reply to this email.",
    `Order ${a.orderId}`,
  ].join('\n');
  return { subject: 'Your Clutch Studio order is confirmed', html, text };
}

export function shippedEmail(a: { orderId: string; items: string[]; carrier: string; trackingNumber: string }) {
  const html = `<p>Good news: your Clutch Studio order has shipped.</p>
${list(a.items)}
<p>Carrier: ${escapeHtml(a.carrier)}<br>Tracking number: <strong>${escapeHtml(a.trackingNumber)}</strong></p>
<p>Tracking can take a day or two to show the first scan. Questions? Reply to this email.</p>
<p style="color:#666;font-size:12px">Order ${escapeHtml(a.orderId)}</p>`;
  const text = [
    'Good news: your Clutch Studio order has shipped.',
    ...a.items.map((i) => `- ${i}`),
    `Carrier: ${a.carrier}`,
    `Tracking number: ${a.trackingNumber}`,
    'Tracking can take a day or two to show the first scan. Questions? Reply to this email.',
    `Order ${a.orderId}`,
  ].join('\n');
  return { subject: 'Your Clutch Studio order has shipped', html, text };
}

/** Internal mail (Spanish, plain): everything needed to place the order at the supplier by hand. */
export function opsEmail(subject: string, body: string[]) {
  return { subject, text: body.join('\n'), html: `<pre style="font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(body.join('\n'))}</pre>` };
}
