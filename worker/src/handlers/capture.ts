import type { Deps } from '../env';
import { HttpError, json, readJson, assertSameOrigin, clientIp } from '../http';
import { rateLimit } from '../ratelimit';
import { createPayPal, extractCapture, captureMatchesOrder } from '../paypal';
import { fulfillOnce, orderBy } from '../fulfill';
import { checkShippable, getFulfillment, type PhysicalItem } from '../shipments';
import { extractShipping } from '../shipping';

const PAYPAL_ID_RE = /^[A-Z0-9]{8,32}$/;

const SHIPPING_ERRORS = {
  no_address: "PayPal didn't share a shipping address. You have not been charged.",
  country_not_supported: 'We ship physical items to the United States, the European Union and Australia only. You have not been charged.',
  item_not_shippable: "One of the items in your cart can't ship to that country yet. You have not been charged.",
} as const;

const SHIP_MESSAGES = {
  PENDING: "Payment confirmed. We're preparing your order and will email you the tracking number as soon as it ships.",
  BLOCKED: "Payment received, but we can't ship to that address. We'll refund you in full and email you shortly.",
} as const;

/**
 * Called by the JS SDK's onApprove. The browser only tells us WHICH PayPal order to capture;
 * whether it is paid is decided by PayPal's capture response, checked against our stored order.
 */
export async function captureOrder(req: Request, deps: Deps): Promise<Response> {
  assertSameOrigin(req, deps.env.SITE_URL);
  await rateLimit(deps.env.DB, `capture:${clientIp(req)}`, 10, 60, deps.now());
  const body = (await readJson(req)) as any;
  const paypalOrderId = body?.orderID;
  if (typeof paypalOrderId !== 'string' || !PAYPAL_ID_RE.test(paypalOrderId)) throw new HttpError(400, 'invalid_order_id');

  const order = await orderBy(deps, 'paypal_order_id', paypalOrderId);
  if (!order) throw new HttpError(404, 'order_not_found');
  const fulfillment = await getFulfillment(deps, order.id);
  if (order.status === 'PAID') {
    const message = fulfillment
      ? 'This order is already paid. We emailed you the order details.'
      : 'This order is already paid. Your download links were sent by email.';
    return json({ status: 'paid', downloads: null, message });
  }
  if (order.status !== 'CREATED' && order.status !== 'PENDING') throw new HttpError(409, 'order_not_payable');

  const paypal = createPayPal(deps.env, deps.fetch, deps.now);
  let address = null;
  if (fulfillment) {
    // Check where it ships BEFORE taking the money: a wrong country is never charged.
    address = extractShipping(await paypal.getOrder(paypalOrderId));
    const check = checkShippable(deps, JSON.parse(fulfillment.items_json) as PhysicalItem[], address);
    if (!check.ok) throw new HttpError(422, 'shipping_not_available', SHIPPING_ERRORS[check.reason]);
  }

  const result = await paypal.captureOrder(paypalOrderId, order.id);
  const { capture, payerEmail } = extractCapture(result);
  if (!capture) throw new HttpError(402, 'payment_not_completed');
  const match = captureMatchesOrder(capture, order, deps.env.PAYPAL_MERCHANT_ID);
  if (!match.ok) {
    console.error('capture_mismatch', order.id, match.reason);
    throw new HttpError(402, 'payment_mismatch');
  }
  if (capture.status === 'PENDING') {
    // e.g. eCheck or a payment under review: the webhook delivers when it completes.
    await deps.env.DB.prepare(`UPDATE orders SET status = 'PENDING', updated_at = ?1 WHERE id = ?2 AND status = 'CREATED'`).bind(deps.now(), order.id).run();
    const message = fulfillment
      ? 'Your payment is pending at PayPal. We will email you as soon as it clears.'
      : 'Your payment is pending at PayPal. We will email your files as soon as it clears.';
    return json({ status: 'pending', downloads: null, message });
  }
  if (capture.status !== 'COMPLETED') throw new HttpError(402, 'payment_not_completed');

  // The captured order carries the final address; fall back to the one read before capture.
  const done = await fulfillOnce(deps, order, capture.id, payerEmail, extractShipping(result) ?? address);
  if (!done) {
    const message = fulfillment ? 'Payment confirmed. We emailed you the order details.' : 'Payment confirmed. Your download links were sent by email.';
    return json({ status: 'paid', downloads: null, message });
  }
  if (!done.shipment) return json({ status: 'paid', downloads: done.links });
  return json({
    status: 'paid',
    downloads: done.links,
    message: SHIP_MESSAGES[done.shipment.status],
    shipping: { status: done.shipment.status === 'PENDING' ? 'preparing' : 'blocked', items: done.shipment.items.map((i) => i.title) },
  });
}
