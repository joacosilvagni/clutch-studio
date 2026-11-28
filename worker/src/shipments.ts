// Physical goods: who ships where, what was paid, and what Joaquín has to buy from the supplier.
// There is no automatic supplier order: each paid order emails the details, and the admin API
// records the supplier order and the tracking number afterwards.
import type { CatalogProduct, Deps } from './env';
import { centsToUsd } from './paypal';
import { destinationFor, formatAddress, type Destination, type ShippingAddress } from './shipping';
import { buyerAddress, opsAddress, opsEmail, orderConfirmationEmail, sendMail } from './mail';

export type FulfillmentStatus = 'AWAITING_PAYMENT' | 'PENDING' | 'ORDERED' | 'SHIPPED' | 'BLOCKED' | 'CANCELLED';

export interface FulfillmentRow {
  order_id: string;
  status: FulfillmentStatus;
  items_json: string;
  destination: Destination | null;
  ship_name: string | null;
  address_json: string | null;
  country_code: string | null;
  supplier_order_ref: string | null;
  carrier: string | null;
  tracking_number: string | null;
  paypal_tracker_status: string | null;
  notified_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface PhysicalItem {
  slug: string;
  title: string;
  qty: number;
}

export const isPhysical = (p: CatalogProduct | undefined): boolean => p?.kind === 'physical';

/** Called when the order is created, before PayPal: lets capture know it must check an address. */
export async function createFulfillment(deps: Deps, orderId: string, items: PhysicalItem[]): Promise<void> {
  const now = deps.now();
  await deps.env.DB.prepare(
    `INSERT INTO fulfillments (order_id, status, items_json, created_at, updated_at) VALUES (?1, 'AWAITING_PAYMENT', ?2, ?3, ?3)`,
  )
    .bind(orderId, JSON.stringify(items), now)
    .run();
}

export async function getFulfillment(deps: Deps, orderId: string): Promise<FulfillmentRow | null> {
  return deps.env.DB.prepare(`SELECT * FROM fulfillments WHERE order_id = ?1`).bind(orderId).first<FulfillmentRow>();
}

/** Can every physical item in the order go to this address? */
export function checkShippable(
  deps: Deps,
  items: PhysicalItem[],
  address: ShippingAddress | null,
): { ok: true; destination: Destination } | { ok: false; reason: 'no_address' | 'country_not_supported' | 'item_not_shippable' } {
  if (!address) return { ok: false, reason: 'no_address' };
  const destination = destinationFor(address.country_code);
  if (!destination) return { ok: false, reason: 'country_not_supported' };
  for (const it of items) {
    const p = deps.catalog.products[it.slug];
    if (!p?.ship_to?.includes(destination)) return { ok: false, reason: 'item_not_shippable' };
  }
  return { ok: true, destination };
}

/**
 * Stores the address of a just-paid order and tells Joaquín what to buy. Runs once: only the
 * AWAITING_PAYMENT -> PENDING|BLOCKED transition sends mail. BLOCKED means money arrived for an
 * address we can't serve (capture raced the pre-check): it needs a refund, never a supplier order.
 */
export async function recordPaidShipment(
  deps: Deps,
  order: { id: string; total_cents: number; payer_email: string | null },
  captureId: string,
  payerEmail: string | null,
  address: ShippingAddress | null,
): Promise<{ status: 'PENDING' | 'BLOCKED'; items: PhysicalItem[] } | null> {
  const f = await getFulfillment(deps, order.id);
  if (!f) return null;
  const items = JSON.parse(f.items_json) as PhysicalItem[];
  const check = checkShippable(deps, items, address);
  const status = check.ok ? 'PENDING' : 'BLOCKED';
  const now = deps.now();
  const won = await deps.env.DB.prepare(
    `UPDATE fulfillments SET status = ?1, destination = ?2, ship_name = ?3, address_json = ?4, country_code = ?5, updated_at = ?6
     WHERE order_id = ?7 AND status = 'AWAITING_PAYMENT' RETURNING order_id`,
  )
    .bind(status, check.ok ? check.destination : null, address?.name ?? null, address ? JSON.stringify(address) : null, address?.country_code ?? null, now, order.id)
    .first();
  if (!won) return null;

  deps.waitUntil(notifyOps(deps, order, captureId, payerEmail, items, address, check));
  const email = payerEmail ?? order.payer_email;
  if (check.ok && address && email) {
    const m = orderConfirmationEmail({ orderId: order.id, items: items.map(itemLabel), address: formatAddress(address) });
    deps.waitUntil(sendMail(deps.env, deps.fetch, { to: buyerAddress(deps.env, email), ...m, idempotencyKey: `confirm-${order.id}` }).then(() => undefined));
  }
  return { status, items };
}

const itemLabel = (i: PhysicalItem) => (i.qty > 1 ? `${i.title} ×${i.qty}` : i.title);

async function notifyOps(
  deps: Deps,
  order: { id: string; total_cents: number },
  captureId: string,
  payerEmail: string | null,
  items: PhysicalItem[],
  address: ShippingAddress | null,
  check: ReturnType<typeof checkShippable>,
): Promise<void> {
  const to = opsAddress(deps.env);
  if (!to) {
    console.error('ops_mail_unconfigured', order.id);
    return;
  }
  const sandbox = deps.env.PAYPAL_ENV === 'sandbox';
  const dest = check.ok ? check.destination : null;
  const body: string[] = [];
  if (sandbox) body.push('SANDBOX: pago de prueba. NO compres nada en CJ.', '');
  if (!check.ok) body.push(`BLOQUEADO (${check.reason}): no se puede enviar a esta dirección. Reembolsá el pago en PayPal; el webhook cancela el envío.`, '');
  body.push(`Orden: ${order.id}`, `Captura PayPal: ${captureId}`, `Cobrado (orden completa): USD ${centsToUsd(order.total_cents)}`, `Comprador: ${payerEmail ?? '(sin email)'}`, '');
  body.push('Enviar a:', ...(address ? formatAddress(address).map((l) => `  ${l}`) : ['  (PayPal no devolvió dirección)']), '');
  if (dest) body.push(`Destino: ${dest}`, '');
  body.push('Productos:');
  let cost = 0;
  let costKnown = true;
  for (const it of items) {
    const p = deps.catalog.products[it.slug];
    const sp = p?.supplier;
    body.push(`- ${itemLabel(it)} (${it.slug})`);
    if (!sp) {
      body.push('  (sin proveedor: producto de prueba)');
      costKnown = false;
      continue;
    }
    body.push(`  ${sp.platform ?? 'proveedor'}: ${sp.product_url}`);
    if (sp.pid || sp.variant) body.push(`  pid: ${sp.pid ?? '-'} · variante: ${sp.variant ?? '-'}`);
    const route = dest ? sp.shipping[dest] : undefined;
    body.push(`  costo producto: USD ${sp.cost_usd}${route ? ` · envío sugerido: ${route.method ?? '-'} (USD ${route.cost_usd})` : ''}`);
    if (route) cost += (Number(sp.cost_usd) + Number(route.cost_usd)) * it.qty;
    else costKnown = false;
  }
  if (costKnown && check.ok) body.push('', `Costo estimado en CJ: USD ${cost.toFixed(2)} (cotizado; confirmalo al comprar)`);
  if (check.ok) {
    body.push(
      '',
      'Usá una línea con tracking. PayPal no pasa teléfono: si CJ lo exige, pedíselo al comprador por mail.',
      'Cuando lo compres:      npm run fulfillment -- ordered ' + order.id + ' <nro de pedido CJ>',
      'Cuando tengas tracking: npm run fulfillment -- shipped ' + order.id + ' <CARRIER> <tracking>',
    );
  }
  const tag = sandbox ? '[SANDBOX] ' : !check.ok ? '[BLOQUEADO] ' : '';
  const m = opsEmail(`${tag}Pedido para comprar en CJ · ${items.map((i) => i.title).join(', ').slice(0, 80)}`, body);
  const ok = await sendMail(deps.env, deps.fetch, { to, ...m, idempotencyKey: `ops-${order.id}` });
  if (ok) await deps.env.DB.prepare(`UPDATE fulfillments SET notified_at = ?1 WHERE order_id = ?2`).bind(deps.now(), order.id).run();
}

/**
 * Refund, reversal or denied payment. Unbought shipments are cancelled; if the supplier order was
 * already placed (ORDERED/SHIPPED) Joaquín gets an alert, because CJ has to be dealt with by hand.
 */
export async function cancelFulfillment(deps: Deps, orderId: string, reason: string): Promise<void> {
  const f = await getFulfillment(deps, orderId);
  if (!f || f.status === 'CANCELLED') return;
  const now = deps.now();
  await deps.env.DB.prepare(`UPDATE fulfillments SET status = 'CANCELLED', updated_at = ?1 WHERE order_id = ?2`).bind(now, orderId).run();
  if (f.status !== 'ORDERED' && f.status !== 'SHIPPED') return;
  const to = opsAddress(deps.env);
  if (!to) return;
  const m = opsEmail(`[ALERTA] ${reason} de un pedido ya comprado en CJ`, [
    `La orden ${orderId} quedó ${reason} en PayPal, pero el envío estaba en ${f.status}.`,
    `Pedido CJ: ${f.supplier_order_ref ?? '(sin cargar)'} · tracking: ${f.tracking_number ?? '-'}`,
    'Revisá si se puede cancelar en CJ o abrir una disputa con ellos.',
  ]);
  deps.waitUntil(sendMail(deps.env, deps.fetch, { to, ...m, idempotencyKey: `alert-${orderId}-${reason}` }).then(() => undefined));
}
