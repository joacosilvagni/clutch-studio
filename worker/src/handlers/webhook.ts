import type { Deps } from '../env';
import { json, readText, HttpError } from '../http';
import { verifyWebhookSelf } from '../webhook-verify';
import { createPayPal, captureMatchesOrder } from '../paypal';
import { fulfillOnce, orderBy, revokeOrder } from '../fulfill';
import { cancelFulfillment } from '../shipments';
import { extractShipping, type ShippingAddress } from '../shipping';

function captureIdFromRefund(resource: any): string | null {
  const up = (resource?.links ?? []).find((l: any) => l?.rel === 'up' && typeof l.href === 'string');
  const m = up?.href.match(/\/v2\/payments\/captures\/([A-Z0-9]+)/);
  return m ? m[1] : null;
}

export async function paypalWebhook(req: Request, deps: Deps): Promise<Response> {
  const rawBody = await readText(req, 64 * 1024);
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  const paypal = createPayPal(deps.env, deps.fetch, deps.now);
  let verified = false;
  try {
    verified = await verifyWebhookSelf({ headers: req.headers, rawBody, webhookId: deps.env.PAYPAL_WEBHOOK_ID, fetchImpl: deps.fetch });
  } catch (err) {
    console.error('webhook_self_verify_error', err instanceof Error ? err.message : err);
  }
  if (!verified) verified = await paypal.verifyWebhookPostback(req.headers, event);
  if (!verified) throw new HttpError(401, 'invalid_signature');

  if (typeof event?.id !== 'string' || typeof event?.event_type !== 'string') throw new HttpError(400, 'invalid_event');
  const fresh = await deps.env.DB.prepare(
    `INSERT INTO webhook_events (event_id, event_type, resource_id, received_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING RETURNING event_id`,
  )
    .bind(event.id, event.event_type, event.resource?.id ?? null, deps.now())
    .first();
  if (!fresh) return json({ ok: true, duplicate: true });

  try {
    await handleEvent(event, deps, paypal);
  } catch (err) {
    // Forget the event so PayPal's retry gets processed again.
    await deps.env.DB.prepare(`DELETE FROM webhook_events WHERE event_id = ?1`).bind(event.id).run();
    throw err;
  }
  return json({ ok: true });
}

async function handleEvent(event: any, deps: Deps, paypal: ReturnType<typeof createPayPal>): Promise<void> {
  const resource = event.resource ?? {};
  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      // Do not trust the event body: read the capture back from PayPal.
      const capture = await paypal.getCapture(String(resource.id));
      if (capture.status !== 'COMPLETED' || !capture.custom_id) return;
      const order = await orderBy(deps, 'id', capture.custom_id);
      if (!order) return;
      if (!captureMatchesOrder(capture, order, deps.env.PAYPAL_MERCHANT_ID).ok) {
        console.error('webhook_capture_mismatch', order.id);
        return;
      }
      // The capture has no payer email or shipping address; the order does.
      let payerEmail: string | null = null;
      let address: ShippingAddress | null = null;
      if (order.paypal_order_id) {
        const ppOrder = await paypal.getOrder(order.paypal_order_id);
        payerEmail = ppOrder?.payer?.email_address ?? null;
        address = extractShipping(ppOrder);
      }
      await fulfillOnce(deps, order, capture.id, payerEmail, address);
      return;
    }
    case 'PAYMENT.CAPTURE.REFUNDED':
    case 'PAYMENT.CAPTURE.REVERSED': {
      const captureId = captureIdFromRefund(resource) ?? (typeof resource.id === 'string' ? resource.id : null);
      if (!captureId) return;
      const order = await orderBy(deps, 'capture_id', captureId);
      if (order) await revokeOrder(deps, order.id, event.event_type.endsWith('REFUNDED') ? 'REFUNDED' : 'REVERSED');
      return;
    }
    case 'PAYMENT.CAPTURE.DENIED': {
      const customId = resource.custom_id;
      if (typeof customId === 'string') {
        const denied = await deps.env.DB.prepare(
          `UPDATE orders SET status = 'DENIED', updated_at = ?1 WHERE id = ?2 AND status IN ('CREATED', 'PENDING') RETURNING id`,
        )
          .bind(deps.now(), customId)
          .first();
        if (denied) await cancelFulfillment(deps, customId, 'denegada');
      }
      return;
    }
    default:
      return;
  }
}
