// Minimal admin API for physical orders, called from worker/scripts/fulfillment.mjs (not from the site).
//   GET  /api/admin/fulfillments?status=PENDING     list shipments
//   POST /api/admin/fulfillment {order_id, action: 'ordered', supplier_order_ref}
//   POST /api/admin/fulfillment {order_id, action: 'shipped', carrier, tracking_number, carrier_name_other?}
// Auth: Authorization: Bearer <ADMIN_TOKEN> (a Worker secret). Without the secret the API does not exist.
import type { Deps } from '../env';
import { HttpError, json, readJson, clientIp } from '../http';
import { rateLimit } from '../ratelimit';
import { sha256Hex } from '../crypto';
import { createPayPal } from '../paypal';
import { getFulfillment, type FulfillmentRow, type FulfillmentStatus, type PhysicalItem } from '../shipments';
import { buyerAddress, sendMail, shippedEmail } from '../mail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// PayPal carrier enum values (USPS, DHL, YANWEN, CHINA_POST, ...). OTHER needs carrier_name_other.
const CARRIER_RE = /^[A-Z0-9_]{2,64}$/;
const TRACKING_RE = /^[A-Za-z0-9-]{4,64}$/;
const REF_RE = /^[A-Za-z0-9_-]{1,64}$/;
const STATUSES: FulfillmentStatus[] = ['AWAITING_PAYMENT', 'PENDING', 'ORDERED', 'SHIPPED', 'BLOCKED', 'CANCELLED'];

async function assertAdmin(req: Request, deps: Deps): Promise<void> {
  const secret = deps.env.ADMIN_TOKEN;
  if (!secret || secret.length < 32) throw new HttpError(404, 'not_found');
  await rateLimit(deps.env.DB, `admin:${clientIp(req)}`, 30, 60, deps.now());
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  // Compare digests so the comparison time doesn't depend on where the strings differ.
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (diff !== 0) throw new HttpError(401, 'unauthorized');
}

function view(f: FulfillmentRow & { payer_email?: string | null; capture_id?: string | null }) {
  return {
    order_id: f.order_id,
    status: f.status,
    items: JSON.parse(f.items_json) as PhysicalItem[],
    destination: f.destination,
    address: f.address_json ? JSON.parse(f.address_json) : null,
    payer_email: f.payer_email ?? null,
    capture_id: f.capture_id ?? null,
    supplier_order_ref: f.supplier_order_ref,
    carrier: f.carrier,
    tracking_number: f.tracking_number,
    paypal_tracker_status: f.paypal_tracker_status,
    notified: f.notified_at != null,
    created_at: new Date(f.created_at).toISOString(),
  };
}

export async function listFulfillments(req: Request, deps: Deps): Promise<Response> {
  await assertAdmin(req, deps);
  const status = new URL(req.url).searchParams.get('status');
  if (status && !STATUSES.includes(status as FulfillmentStatus)) throw new HttpError(400, 'invalid_status');
  const sql = `SELECT f.*, o.payer_email, o.capture_id FROM fulfillments f JOIN orders o ON o.id = f.order_id
               ${status ? 'WHERE f.status = ?1' : "WHERE f.status != 'AWAITING_PAYMENT'"} ORDER BY f.created_at DESC LIMIT 100`;
  const stmt = deps.env.DB.prepare(sql);
  const { results } = await (status ? stmt.bind(status) : stmt).all<FulfillmentRow & { payer_email: string | null; capture_id: string | null }>();
  return json({ fulfillments: results.map(view) });
}

export async function updateFulfillment(req: Request, deps: Deps): Promise<Response> {
  await assertAdmin(req, deps);
  const body = (await readJson(req)) as any;
  const orderId = String(body?.order_id ?? '');
  if (!UUID_RE.test(orderId)) throw new HttpError(400, 'invalid_order_id');
  const f = await getFulfillment(deps, orderId);
  if (!f) throw new HttpError(404, 'fulfillment_not_found');
  const now = deps.now();

  if (body.action === 'ordered') {
    const ref = String(body.supplier_order_ref ?? '');
    if (!REF_RE.test(ref)) throw new HttpError(400, 'invalid_supplier_order_ref');
    if (f.status !== 'PENDING' && f.status !== 'ORDERED') throw new HttpError(409, 'invalid_transition', `Fulfillment is ${f.status}`);
    await deps.env.DB.prepare(`UPDATE fulfillments SET status = 'ORDERED', supplier_order_ref = ?1, updated_at = ?2 WHERE order_id = ?3`)
      .bind(ref, now, orderId)
      .run();
    return json({ ok: true, status: 'ORDERED' });
  }

  if (body.action === 'shipped') {
    const carrier = String(body.carrier ?? '').toUpperCase();
    const tracking = String(body.tracking_number ?? '');
    const other = body.carrier_name_other == null ? null : String(body.carrier_name_other).slice(0, 64);
    if (!CARRIER_RE.test(carrier)) throw new HttpError(400, 'invalid_carrier');
    if (carrier === 'OTHER' && !other) throw new HttpError(400, 'invalid_carrier', 'carrier OTHER needs carrier_name_other');
    if (!TRACKING_RE.test(tracking)) throw new HttpError(400, 'invalid_tracking_number');
    // SHIPPED again is allowed only to retry a tracker PayPal rejected.
    const retry = f.status === 'SHIPPED' && f.paypal_tracker_status !== 'sent';
    if (f.status !== 'PENDING' && f.status !== 'ORDERED' && !retry) throw new HttpError(409, 'invalid_transition', `Fulfillment is ${f.status}`);
    const order = await deps.env.DB.prepare(`SELECT capture_id, payer_email FROM orders WHERE id = ?1`)
      .bind(orderId)
      .first<{ capture_id: string | null; payer_email: string | null }>();
    if (!order?.capture_id) throw new HttpError(409, 'order_not_captured');

    const tracker = await createPayPal(deps.env, deps.fetch, deps.now).addTracker({
      captureId: order.capture_id,
      trackingNumber: tracking,
      carrier,
      carrierNameOther: other,
    });
    if (!tracker.ok) console.error('paypal_tracker_failed', orderId, tracker.detail);
    await deps.env.DB.prepare(
      `UPDATE fulfillments SET status = 'SHIPPED', carrier = ?1, tracking_number = ?2, paypal_tracker_status = ?3, updated_at = ?4 WHERE order_id = ?5`,
    )
      .bind(carrier === 'OTHER' ? `OTHER:${other}` : carrier, tracking, tracker.ok ? 'sent' : 'failed', now, orderId)
      .run();
    if (order.payer_email && !retry) {
      const items = (JSON.parse(f.items_json) as PhysicalItem[]).map((i) => i.title);
      const m = shippedEmail({ orderId, items, carrier: carrier === 'OTHER' ? other! : carrier.replace(/_/g, ' '), trackingNumber: tracking });
      deps.waitUntil(sendMail(deps.env, deps.fetch, { to: buyerAddress(deps.env, order.payer_email), ...m, idempotencyKey: `shipped-${orderId}` }).then(() => undefined));
    }
    return json({ ok: true, status: 'SHIPPED', paypal_tracker: tracker.ok ? 'sent' : 'failed', detail: tracker.detail ?? null });
  }

  throw new HttpError(400, 'invalid_action');
}
