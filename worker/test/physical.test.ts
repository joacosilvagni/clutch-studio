import { describe, it, expect, beforeEach } from 'vitest';
import { route } from '../src/index';
import { _resetTokenCacheForTests } from '../src/paypal';
import { destinationFor, extractShipping } from '../src/shipping';
import { makeDeps, scriptedFetch, apiRequest, catalog as digitalCatalog, SITE, type Route } from './helpers';
import type { Catalog } from '../src/env';

const ADMIN = 'a'.repeat(40);

const catalog: Catalog = {
  currency: 'USD',
  products: {
    ...digitalCatalog.products,
    'obd2-scanner': {
      slug: 'obd2-scanner', title: 'OBD2 Diagnostic Scanner', price_cents: 3495, files: [], kind: 'physical', ship_to: ['US', 'EU'],
      supplier: {
        platform: 'cj', product_url: 'https://cjdropshipping.com/product/-p-1.html', pid: '1', variant: 'Black', cost_usd: '10.74',
        shipping: { US: { method: 'LuWei Ordinary US', cost_usd: '6.86' }, EU: { method: 'CJPacket Ordinary I', cost_usd: '6.80' } },
      },
    },
    'roof-light': {
      slug: 'roof-light', title: 'USB Roof Star Light', price_cents: 2995, files: [], kind: 'physical', ship_to: ['US', 'EU', 'AU'],
      supplier: { platform: 'cj', product_url: 'https://cjdropshipping.com/product/-p-2.html', pid: '2', variant: null, cost_usd: '4.10', shipping: { US: { method: 'CJPacket', cost_usd: '5.00' }, EU: { method: 'CJPacket', cost_usd: '5.50' }, AU: { method: 'CJPacket', cost_usd: '6.00' } } },
    },
  },
};

const address = (country: string) => ({
  name: { full_name: 'Jane Driver' },
  address: { address_line_1: '1 Main St', admin_area_2: 'Springfield', admin_area_1: 'IL', postal_code: '62701', country_code: country },
});

/** Fake PayPal + Resend for physical orders. */
function world(o: { country?: string; captureCountry?: string; trackerErrors?: unknown[] } = {}) {
  const state = { customId: '', total: '0.00', body: null as any, emails: [] as any[], captureCalls: 0, trackers: [] as any[] };
  const capture = () => ({ id: 'CAP9', status: 'COMPLETED', amount: { currency_code: 'USD', value: state.total }, custom_id: state.customId, payee: { merchant_id: 'MERCHANT1' } });
  const routes: Route[] = [
    (url) => (url.endsWith('/v1/oauth2/token') ? Response.json({ access_token: 'AT', expires_in: 32400 }) : undefined),
    (url, init) => {
      if (url.endsWith('/v2/checkout/orders') && init.method === 'POST') {
        state.body = JSON.parse(String(init.body));
        state.customId = state.body.purchase_units[0].custom_id;
        state.total = state.body.purchase_units[0].amount.value;
        return Response.json({ id: 'PPPHYS01', status: 'CREATED' }, { status: 201 });
      }
    },
    (url, init) => {
      if ((init.method ?? 'GET') === 'GET' && url.endsWith('/v2/checkout/orders/PPPHYS01'))
        return Response.json({ id: 'PPPHYS01', status: 'APPROVED', payer: { email_address: 'buyer@example.com' }, purchase_units: [{ custom_id: state.customId, shipping: address(o.country ?? 'DE') }] });
    },
    (url) => {
      if (url.endsWith('/v2/checkout/orders/PPPHYS01/capture')) {
        state.captureCalls++;
        return Response.json(
          { id: 'PPPHYS01', status: 'COMPLETED', payer: { email_address: 'buyer@example.com' }, purchase_units: [{ custom_id: state.customId, shipping: address(o.captureCountry ?? o.country ?? 'DE'), payments: { captures: [capture()] } }] },
          { status: 201 },
        );
      }
    },
    (url, init) => {
      if (url.endsWith('/v1/shipping/trackers-batch')) {
        state.trackers.push(JSON.parse(String(init.body)));
        return Response.json({ tracker_identifiers: [{ transaction_id: 'CAP9' }], errors: o.trackerErrors ?? [] });
      }
    },
    (url, init) => {
      if (url === 'https://api.resend.com/emails') {
        state.emails.push({ ...JSON.parse(String(init.body)), idem: (init.headers as any)['Idempotency-Key'] });
        return Response.json({ id: 'email' });
      }
    },
  ];
  return { state, ...scriptedFetch(routes) };
}

function setup(w: ReturnType<typeof world>, env: Record<string, string> = {}) {
  const t = makeDeps(w.fn, { ORDER_NOTIFY_TO: 'ops@shop.test', ADMIN_TOKEN: ADMIN, ...env });
  t.deps.catalog = catalog;
  return t;
}

async function call(deps: any, req: Request) {
  const res = await route(req, deps);
  if (!res) throw new Error('static');
  return res;
}

async function checkout(t: ReturnType<typeof setup>, slugs: string[]) {
  const created = await call(t.deps, apiRequest('/api/orders', { items: slugs.map((slug) => ({ slug })) }));
  expect(created.status).toBe(200);
  const res = await call(t.deps, apiRequest('/api/capture', { orderID: 'PPPHYS01' }));
  await t.settle();
  return res;
}

function admin(method: string, path: string, body?: unknown, token = ADMIN) {
  return new Request(`${SITE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '198.51.100.1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => _resetTokenCacheForTests());

describe('shipping zones', () => {
  it('ships to the US, the EU-27 and Australia only', () => {
    expect(destinationFor('US')).toBe('US');
    expect(destinationFor('au')).toBe('AU');
    for (const c of ['DE', 'FR', 'GR', 'IE', 'SE']) expect(destinationFor(c)).toBe('EU');
    for (const c of ['GB', 'CH', 'NO', 'CA', 'AR', '', null]) expect(destinationFor(c)).toBeNull();
  });
  it('reads the PayPal shipping block and ignores incomplete ones', () => {
    expect(extractShipping({ purchase_units: [{ shipping: address('US') }] })).toMatchObject({ name: 'Jane Driver', line1: '1 Main St', city: 'Springfield', country_code: 'US' });
    expect(extractShipping({ purchase_units: [{ shipping: { address: { country_code: 'US' } } }] })).toBeNull();
    expect(extractShipping({})).toBeNull();
  });
});

describe('physical checkout', () => {
  it('asks PayPal for an address, prices from the catalog with shipping included', async () => {
    const w = world();
    const t = setup(w);
    await call(t.deps, apiRequest('/api/orders', { items: [{ slug: 'obd2-scanner', price: '0.01' }] }));
    const pu = w.state.body.purchase_units[0];
    expect(w.state.body.application_context.shipping_preference).toBe('GET_FROM_FILE');
    expect(pu.amount.value).toBe('34.95');
    expect(pu.amount.breakdown.shipping).toBeUndefined();
    expect(pu.items[0]).toMatchObject({ category: 'PHYSICAL_GOODS', quantity: '1' });
    const f = t.db.prepare('SELECT status, items_json FROM fulfillments').get() as any;
    expect(f.status).toBe('AWAITING_PAYMENT');
    expect(JSON.parse(f.items_json)).toEqual([{ slug: 'obd2-scanner', title: 'OBD2 Diagnostic Scanner', qty: 1 }]);
  });

  it('digital-only orders still skip shipping', async () => {
    const w = world();
    const t = setup(w);
    await call(t.deps, apiRequest('/api/orders', { items: [{ slug: 'bmw-e30-dash-clip' }] }));
    expect(w.state.body.application_context.shipping_preference).toBe('NO_SHIPPING');
    expect(t.db.prepare('SELECT count(*) AS n FROM fulfillments').get()).toEqual({ n: 0 });
  });

  it('captures, stores the address and emails the buyer and Joaquín', async () => {
    const w = world({ country: 'DE' });
    const t = setup(w);
    const res = await checkout(t, ['obd2-scanner']);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ status: 'paid', downloads: [], shipping: { status: 'preparing', items: ['OBD2 Diagnostic Scanner'] } });
    expect(body.message).toMatch(/tracking number/);
    expect(body.message).not.toMatch(/\d+\s*(business )?days/);

    const f = t.db.prepare('SELECT * FROM fulfillments').get() as any;
    expect(f).toMatchObject({ status: 'PENDING', destination: 'EU', country_code: 'DE', ship_name: 'Jane Driver' });
    expect(f.notified_at).not.toBeNull();

    const ops = w.state.emails.find((e) => e.to[0] === 'ops@shop.test');
    expect(ops.subject).toMatch(/^\[SANDBOX\] Pedido para comprar en CJ/);
    expect(ops.text).toContain('https://cjdropshipping.com/product/-p-1.html');
    expect(ops.text).toContain('CJPacket Ordinary I');
    expect(ops.text).toContain('Springfield');
    expect(ops.text).toContain('NO compres nada');
    const buyer = w.state.emails.find((e) => e.to[0] === 'buyer@example.com');
    expect(buyer.subject).toBe('Your Clutch Studio order is confirmed');
    expect(buyer.text).not.toMatch(/cjdropshipping|10\.74|6\.80/); // supplier data never reaches the buyer
    // No download email for a physical-only order.
    expect(w.state.emails.some((e) => e.subject === 'Your Clutch Studio downloads')).toBe(false);
  });

  it('refuses UK and other countries before capturing: the buyer is never charged', async () => {
    for (const country of ['GB', 'CA']) {
      const w = world({ country });
      const t = setup(w);
      const res = await checkout(t, ['roof-light']);
      expect(res.status).toBe(422);
      expect(((await res.json()) as any).error).toBe('shipping_not_available');
      expect(w.state.captureCalls).toBe(0);
      expect(t.db.prepare('SELECT status FROM orders').get()).toEqual({ status: 'CREATED' });
    }
  });

  it('refuses a destination one item does not ship to (per-product zones)', async () => {
    const w = world({ country: 'AU' });
    const t = setup(w);
    const res = await checkout(t, ['roof-light', 'obd2-scanner']);
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).message).toMatch(/can't ship to that country/);
    expect(w.state.captureCalls).toBe(0);
  });

  it('blocks the shipment and alerts if the captured address is not serviceable', async () => {
    const w = world({ country: 'US', captureCountry: 'GB' });
    const t = setup(w);
    const body = (await (await checkout(t, ['roof-light'])).json()) as any;
    expect(body.shipping.status).toBe('blocked');
    expect(body.message).toMatch(/refund/);
    expect((t.db.prepare('SELECT status FROM fulfillments').get() as any).status).toBe('BLOCKED');
    const ops = w.state.emails.find((e) => e.to[0] === 'ops@shop.test');
    expect(ops.text).toMatch(/BLOQUEADO/);
    expect(w.state.emails.some((e) => e.subject === 'Your Clutch Studio order is confirmed')).toBe(false);
  });

  it('mixed cart: files are delivered at once, the physical item waits for shipping', async () => {
    const w = world({ country: 'US' });
    const t = setup(w);
    const body = (await (await checkout(t, ['bmw-e30-dash-clip', 'obd2-scanner'])).json()) as any;
    expect(w.state.total).toBe('42.95');
    expect(body.downloads).toHaveLength(1);
    expect(body.shipping).toMatchObject({ status: 'preparing', items: ['OBD2 Diagnostic Scanner'] });
    const subjects = w.state.emails.map((e) => e.subject);
    expect(subjects).toContain('Your Clutch Studio downloads');
    expect(subjects).toContain('Your Clutch Studio order is confirmed');
  });

  it('a webhook-only capture still records the address once', async () => {
    const w = world({ country: 'FR' });
    const t = setup(w);
    await call(t.deps, apiRequest('/api/orders', { items: [{ slug: 'obd2-scanner' }] }));
    const { fulfillOnce, orderBy } = await import('../src/fulfill');
    const order = (await orderBy(t.deps, 'paypal_order_id', 'PPPHYS01'))!;
    const addr = extractShipping({ purchase_units: [{ shipping: address('FR') }] });
    expect((await fulfillOnce(t.deps, order, 'CAP9', 'buyer@example.com', addr))?.shipment?.status).toBe('PENDING');
    expect(await fulfillOnce(t.deps, order, 'CAP9', 'buyer@example.com', addr)).toBeNull();
    await t.settle();
    expect(w.state.emails.filter((e) => e.to[0] === 'ops@shop.test')).toHaveLength(1);
  });

  it('a refund cancels a shipment not yet bought, and alerts when it was', async () => {
    const w = world({ country: 'US' });
    const t = setup(w);
    await checkout(t, ['obd2-scanner']);
    const id = (t.db.prepare('SELECT id FROM orders').get() as any).id;
    await call(t.deps, admin('POST', '/api/admin/fulfillment', { order_id: id, action: 'ordered', supplier_order_ref: 'CJ123' }));
    const { revokeOrder } = await import('../src/fulfill');
    await revokeOrder(t.deps, id, 'REFUNDED');
    await t.settle();
    expect((t.db.prepare('SELECT status FROM fulfillments').get() as any).status).toBe('CANCELLED');
    expect(w.state.emails.some((e) => e.subject.startsWith('[ALERTA]') && e.text.includes('CJ123'))).toBe(true);
  });
});

describe('admin fulfillment API', () => {
  it('does not exist without ADMIN_TOKEN and rejects a wrong token', async () => {
    const w = world();
    const off = makeDeps(w.fn);
    expect((await call(off.deps, admin('GET', '/api/admin/fulfillments'))).status).toBe(404);
    const t = setup(w);
    expect((await call(t.deps, admin('GET', '/api/admin/fulfillments', undefined, 'b'.repeat(40)))).status).toBe(401);
    expect((await call(t.deps, admin('GET', '/api/admin/fulfillments', undefined, ''))).status).toBe(401);
  });

  it('lists paid shipments, records the CJ order and sends tracking to PayPal', async () => {
    const w = world({ country: 'US' });
    const t = setup(w);
    await checkout(t, ['obd2-scanner']);
    const list = (await (await call(t.deps, admin('GET', '/api/admin/fulfillments?status=PENDING'))).json()) as any;
    expect(list.fulfillments).toHaveLength(1);
    const f = list.fulfillments[0];
    expect(f).toMatchObject({ status: 'PENDING', destination: 'US', payer_email: 'buyer@example.com', capture_id: 'CAP9' });

    const ordered = await call(t.deps, admin('POST', '/api/admin/fulfillment', { order_id: f.order_id, action: 'ordered', supplier_order_ref: 'CJ-777' }));
    expect(ordered.status).toBe(200);

    const shipped = await call(t.deps, admin('POST', '/api/admin/fulfillment', { order_id: f.order_id, action: 'shipped', carrier: 'usps', tracking_number: '9400111899223' }));
    expect(((await shipped.json()) as any).paypal_tracker).toBe('sent');
    await t.settle();
    expect(w.state.trackers[0].trackers[0]).toEqual({ transaction_id: 'CAP9', tracking_number: '9400111899223', status: 'SHIPPED', carrier: 'USPS', notify_buyer: true });
    const row = t.db.prepare('SELECT status, supplier_order_ref, tracking_number, paypal_tracker_status FROM fulfillments').get();
    expect(row).toEqual({ status: 'SHIPPED', supplier_order_ref: 'CJ-777', tracking_number: '9400111899223', paypal_tracker_status: 'sent' });
    const mail = w.state.emails.find((e) => e.subject === 'Your Clutch Studio order has shipped');
    expect(mail.text).toContain('9400111899223');

    // Shipping twice is refused once PayPal accepted the tracker.
    expect((await call(t.deps, admin('POST', '/api/admin/fulfillment', { order_id: f.order_id, action: 'shipped', carrier: 'USPS', tracking_number: '9400111899223' }))).status).toBe(409);
  });

  it('keeps the tracking when PayPal rejects it so the call can be retried', async () => {
    const w = world({ country: 'US', trackerErrors: [{ message: 'INVALID_CARRIER' }] });
    const t = setup(w);
    await checkout(t, ['obd2-scanner']);
    const id = (t.db.prepare('SELECT id FROM orders').get() as any).id;
    const res = (await (await call(t.deps, admin('POST', '/api/admin/fulfillment', { order_id: id, action: 'shipped', carrier: 'OTHER', carrier_name_other: 'CJPacket', tracking_number: 'CJ0001' }))).json()) as any;
    expect(res).toMatchObject({ paypal_tracker: 'failed', detail: 'INVALID_CARRIER' });
    expect(w.state.trackers[0].trackers[0].carrier_name_other).toBe('CJPacket');
    const retry = await call(t.deps, admin('POST', '/api/admin/fulfillment', { order_id: id, action: 'shipped', carrier: 'YANWEN', tracking_number: 'CJ0001' }));
    expect(retry.status).toBe(200);
  });

  it('validates input and transitions', async () => {
    const w = world({ country: 'US' });
    const t = setup(w);
    const post = (b: unknown) => call(t.deps, admin('POST', '/api/admin/fulfillment', b));
    expect((await post({ order_id: 'nope', action: 'ordered' })).status).toBe(400);
    expect((await post({ order_id: '00000000-0000-4000-8000-000000000000', action: 'ordered', supplier_order_ref: 'x' })).status).toBe(404);
    await call(t.deps, apiRequest('/api/orders', { items: [{ slug: 'obd2-scanner' }] }));
    const id = (t.db.prepare('SELECT id FROM orders').get() as any).id;
    // Unpaid orders can't be marked as bought or shipped.
    expect((await post({ order_id: id, action: 'ordered', supplier_order_ref: 'CJ1' })).status).toBe(409);
    expect((await post({ order_id: id, action: 'shipped', carrier: 'USPS', tracking_number: 'bad tracking!' })).status).toBe(400);
    expect((await post({ order_id: id, action: 'delete' })).status).toBe(400);
  });
});
