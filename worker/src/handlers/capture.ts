import type { Deps } from '../env';
import { HttpError, json, readJson, assertSameOrigin, clientIp } from '../http';
import { rateLimit } from '../ratelimit';
import { createPayPal, extractCapture, captureMatchesOrder } from '../paypal';
import { fulfillOnce, orderBy } from '../fulfill';

const PAYPAL_ID_RE = /^[A-Z0-9]{8,32}$/;

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
  if (order.status === 'PAID') {
    return json({ status: 'paid', downloads: null, message: 'This order is already paid. Your download links were sent by email.' });
  }
  if (order.status !== 'CREATED' && order.status !== 'PENDING') throw new HttpError(409, 'order_not_payable');

  const result = await createPayPal(deps.env, deps.fetch, deps.now).captureOrder(paypalOrderId, order.id);
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
    return json({ status: 'pending', downloads: null, message: 'Your payment is pending at PayPal. We will email your files as soon as it clears.' });
  }
  if (capture.status !== 'COMPLETED') throw new HttpError(402, 'payment_not_completed');

  const links = await fulfillOnce(deps, order, capture.id, payerEmail);
  if (!links) return json({ status: 'paid', downloads: null, message: 'Payment confirmed. Your download links were sent by email.' });
  return json({ status: 'paid', downloads: links });
}
