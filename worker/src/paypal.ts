import type { Env } from './env';
import { HttpError } from './http';

export const centsToUsd = (cents: number): string => (cents / 100).toFixed(2);

export interface PayPalLineItem {
  slug: string;
  title: string;
  price_cents: number;
  physical?: boolean;
}

export interface TrackerInput {
  captureId: string;
  trackingNumber: string;
  carrier: string;
  carrierNameOther?: string | null;
}

export interface Capture {
  id: string;
  status: string;
  amount: { currency_code: string; value: string };
  custom_id?: string;
  invoice_id?: string;
  payee?: { merchant_id?: string };
}

interface TokenCache {
  token: string;
  expiresAt: number;
}
// Per-isolate cache; tokens last ~9h, refreshed 5 min early.
const tokenCache = new Map<string, TokenCache>();

export function paypalBase(env: Env): string {
  return env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export function createPayPal(env: Env, fetchImpl: typeof fetch, now: () => number) {
  const base = paypalBase(env);

  async function accessToken(): Promise<string> {
    const cached = tokenCache.get(env.PAYPAL_CLIENT_ID);
    if (cached && cached.expiresAt > now()) return cached.token;
    const res = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new HttpError(502, 'paypal_auth_failed');
    const data = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache.set(env.PAYPAL_CLIENT_ID, { token: data.access_token, expiresAt: now() + (data.expires_in - 300) * 1000 });
    return data.access_token;
  }

  async function call(method: string, path: string, body?: unknown, requestId?: string): Promise<{ status: number; data: any }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    if (requestId) headers['PayPal-Request-Id'] = requestId;
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data };
  }

  return {
    async createOrder(orderId: string, items: PayPalLineItem[], totalCents: number): Promise<string> {
      const value = centsToUsd(totalCents);
      const physical = items.some((i) => i.physical);
      const { status, data } = await call(
        'POST',
        '/v2/checkout/orders',
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: 'default',
              custom_id: orderId,
              invoice_id: orderId,
              description: physical ? 'Clutch Studio order' : 'Clutch Studio digital files',
              // Shipping is included in each physical item's price, so there is no shipping line.
              amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
              items: items.map((i) => ({
                name: i.title.slice(0, 127),
                sku: i.slug.slice(0, 127),
                quantity: '1',
                category: i.physical ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS',
                unit_amount: { currency_code: 'USD', value: centsToUsd(i.price_cents) },
              })),
            },
          ],
          // Digital-only: no shipping address. With physical items PayPal asks for the buyer's address
          // (GET_FROM_FILE); /api/capture checks the country before capturing. (application_context is
          // deprecated but still honored, and unlike payment_source.paypal it keeps the card button working.)
          application_context: { shipping_preference: physical ? 'GET_FROM_FILE' : 'NO_SHIPPING', user_action: 'PAY_NOW', brand_name: 'Clutch Studio' },
        },
        `create-${orderId}`,
      );
      if (status !== 200 && status !== 201) throw new HttpError(502, 'paypal_create_failed');
      return data.id as string;
    },

    /** Adds tracking to the PayPal transaction; PayPal emails the buyer (notify_buyer). */
    async addTracker(t: TrackerInput): Promise<{ ok: boolean; detail?: string }> {
      const tracker: Record<string, unknown> = {
        transaction_id: t.captureId,
        tracking_number: t.trackingNumber,
        status: 'SHIPPED',
        carrier: t.carrier,
        notify_buyer: true,
      };
      if (t.carrier === 'OTHER') tracker.carrier_name_other = t.carrierNameOther;
      const { status, data } = await call('POST', '/v1/shipping/trackers-batch', { trackers: [tracker] });
      const errors = Array.isArray(data?.errors) ? data.errors : [];
      if ((status === 200 || status === 201) && errors.length === 0) return { ok: true };
      const detail = errors[0]?.message ?? data?.message ?? `http_${status}`;
      return { ok: false, detail: String(detail).slice(0, 300) };
    },

    /** Captures, and on any failure re-reads the order so an already-captured order still resolves. */
    async captureOrder(paypalOrderId: string, orderId: string): Promise<any> {
      const cap = await call('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {}, `capture-${orderId}`);
      if (cap.status === 200 || cap.status === 201) return cap.data;
      const got = await call('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
      if (got.status !== 200) throw new HttpError(502, 'paypal_capture_failed');
      return got.data;
    },

    async getOrder(paypalOrderId: string): Promise<any> {
      const { status, data } = await call('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
      if (status !== 200) throw new HttpError(502, 'paypal_get_order_failed');
      return data;
    },

    async getCapture(captureId: string): Promise<Capture> {
      const { status, data } = await call('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`);
      if (status !== 200) throw new HttpError(502, 'paypal_get_capture_failed');
      return data as Capture;
    },

    /** Fallback verification through PayPal's API (postback). */
    async verifyWebhookPostback(headers: Headers, event: unknown): Promise<boolean> {
      const { status, data } = await call('POST', '/v1/notifications/verify-webhook-signature', {
        auth_algo: headers.get('paypal-auth-algo'),
        cert_url: headers.get('paypal-cert-url'),
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        transmission_time: headers.get('paypal-transmission-time'),
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      });
      return status === 200 && data?.verification_status === 'SUCCESS';
    },
  };
}

export type PayPalClient = ReturnType<typeof createPayPal>;

export function _resetTokenCacheForTests(): void {
  tokenCache.clear();
}

/** Pulls the single capture out of an Orders v2 response. */
export function extractCapture(order: any): { capture: Capture | null; customId: string | null; payerEmail: string | null } {
  const pu = order?.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0] ?? null;
  return {
    capture: capture ? { ...capture, custom_id: capture.custom_id ?? pu?.custom_id } : null,
    customId: pu?.custom_id ?? null,
    payerEmail: order?.payer?.email_address ?? null,
  };
}

/** The checks that decide whether money for THIS order actually reached US. */
export function captureMatchesOrder(
  capture: Capture,
  order: { id: string; total_cents: number },
  merchantId: string | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (capture.custom_id !== order.id) return { ok: false, reason: 'custom_id_mismatch' };
  if (capture.amount?.currency_code !== 'USD') return { ok: false, reason: 'currency_mismatch' };
  if (capture.amount?.value !== centsToUsd(order.total_cents)) return { ok: false, reason: 'amount_mismatch' };
  if (merchantId && capture.payee?.merchant_id && capture.payee.merchant_id !== merchantId) return { ok: false, reason: 'payee_mismatch' };
  return { ok: true };
}
