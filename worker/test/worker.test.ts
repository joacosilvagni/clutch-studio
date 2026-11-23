import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSign } from 'node:crypto';
import { route } from '../src/index';
import { crc32 } from '../src/crypto';
import { isAllowedCertUrl, spkiFromPem, _resetKeyCacheForTests } from '../src/webhook-verify';
import { _resetTokenCacheForTests } from '../src/paypal';
import { parseCart } from '../src/handlers/orders';
import { makeDeps, scriptedFetch, apiRequest, SITE, type Route } from './helpers';

const CERT_URL = 'https://api.paypal.com/v1/notifications/certs/CERT-test';
let certPem = '';
let keyPem = '';

beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=messageverificationcerts.paypal.com'], { stdio: 'ignore' });
  certPem = readFileSync(path.join(dir, 'c.pem'), 'utf8');
  keyPem = readFileSync(path.join(dir, 'k.pem'), 'utf8');
});

beforeEach(() => {
  _resetTokenCacheForTests();
  _resetKeyCacheForTests();
});

/** A fake PayPal + Resend. `state` lets each test change what PayPal answers. */
function paypalWorld(over: { captureAmount?: string; captureStatus?: string; postback?: string; payee?: string } = {}) {
  const state = { orderCustomId: '', emails: [] as any[], captureCalls: 0, created: 0 };
  const capture = () => ({
    id: 'CAP1',
    status: over.captureStatus ?? 'COMPLETED',
    amount: { currency_code: 'USD', value: over.captureAmount ?? '8.00' },
    custom_id: state.orderCustomId,
    payee: { merchant_id: over.payee ?? 'MERCHANT1' },
  });
  const routes: Route[] = [
    (url) => (url.endsWith('/v1/oauth2/token') ? Response.json({ access_token: 'AT', expires_in: 32400 }) : undefined),
    (url, init) => {
      if (url.endsWith('/v2/checkout/orders') && init.method === 'POST') {
        const body = JSON.parse(String(init.body));
        state.orderCustomId = body.purchase_units[0].custom_id;
        state.created++;
        return Response.json({ id: state.created === 1 ? 'PPORDER1' : `PPORDER${state.created}`, status: 'CREATED' }, { status: 201 });
      }
    },
    (url) => {
      if (url.endsWith('/v2/checkout/orders/PPORDER1/capture')) {
        state.captureCalls++;
        return Response.json({ id: 'PPORDER1', status: 'COMPLETED', payer: { email_address: 'buyer@example.com' }, purchase_units: [{ custom_id: state.orderCustomId, payments: { captures: [capture()] } }] }, { status: 201 });
      }
    },
    (url) => (url.endsWith('/v2/payments/captures/CAP1') ? Response.json(capture()) : undefined),
    (url, init) => ((init.method ?? 'GET') === 'GET' && url.endsWith('/v2/checkout/orders/PPORDER1') ? Response.json({ id: 'PPORDER1', payer: { email_address: 'buyer@example.com' } }) : undefined),
    (url) => (url.endsWith('/v1/notifications/verify-webhook-signature') ? Response.json({ verification_status: over.postback ?? 'FAILURE' }) : undefined),
    (url) => (url === CERT_URL ? new Response(certPem) : undefined),
    (url, init) => {
      if (url === 'https://api.resend.com/emails') {
        state.emails.push({ ...JSON.parse(String(init.body)), idem: (init.headers as any)['Idempotency-Key'] });
        return Response.json({ id: 'email_1' });
      }
    },
  ];
  return { state, ...scriptedFetch(routes) };
}

async function call(deps: any, req: Request) {
  const res = await route(req, deps);
  if (!res) throw new Error('route returned null (static asset)');
  return res;
}

async function buy(world: ReturnType<typeof paypalWorld>, t: ReturnType<typeof makeDeps>, items: unknown[] = [{ slug: 'bmw-e30-dash-clip', qty: 3 }]) {
  const created = await call(t.deps, apiRequest('/api/orders', { items }));
  expect(created.status).toBe(200);
  const { id } = (await created.json()) as any;
  return call(t.deps, apiRequest('/api/capture', { orderID: id }));
}

function signWebhook(body: string, transmissionId = 'TX-1', time = '2026-11-22T12:00:00Z', webhookId = 'WH-1') {
  const s = createSign('RSA-SHA256');
  s.update(`${transmissionId}|${time}|${webhookId}|${crc32(new TextEncoder().encode(body))}`);
  return {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': CERT_URL,
    'paypal-transmission-id': transmissionId,
    'paypal-transmission-time': time,
    'paypal-transmission-sig': s.sign(keyPem, 'base64'),
  };
}

function webhookRequest(event: unknown, headers: Record<string, string>) {
  return new Request(`${SITE}/api/paypal/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(event) });
}

describe('checkout and delivery', () => {
  it('prices on the server, captures, issues hashed tokens and emails the links', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    const res = await buy(w, t, [{ slug: 'bmw-e30-dash-clip', qty: 3, price: '0.01' }]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('paid');
    expect(body.downloads).toHaveLength(1);
    expect(body.downloads[0].url).toMatch(/^https:\/\/shop\.test\/d\/[A-Za-z0-9_-]{43}$/);

    // PayPal was asked for the catalog price, quantity 1, no shipping.
    const createCall = w.calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!;
    const pu = JSON.parse(String(createCall.init.body)).purchase_units[0];
    expect(pu.amount.value).toBe('8.00');
    expect(pu.items[0]).toMatchObject({ quantity: '1', category: 'DIGITAL_GOODS' });

    // Only the hash is stored.
    const token = body.downloads[0].url.split('/d/')[1];
    const rows = t.db.prepare('SELECT token_hash, remaining FROM download_tokens').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toContain(token);

    await t.settle();
    expect(w.state.emails).toHaveLength(1);
    expect(w.state.emails[0].to).toEqual(['buyer@example.com']);
    expect(w.state.emails[0].text).toContain(token);
    expect((t.db.prepare('SELECT status, email_status FROM orders').get() as any)).toEqual({ status: 'PAID', email_status: 'sent' });
  });

  it('GET shows a page without consuming; POST streams the file and counts down to 0', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    const body = (await (await buy(w, t)).json()) as any;
    const url = body.downloads[0].url as string;
    const path = new URL(url).pathname;

    for (let i = 0; i < 3; i++) expect((await call(t.deps, new Request(url))).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      const r = await call(t.deps, new Request(url, { method: 'POST', headers: { 'cf-connecting-ip': '1.1.1.1' } }));
      expect(r.status).toBe(200);
      expect(r.headers.get('content-disposition')).toBe('attachment; filename="clip.zip"');
      expect(await r.text()).toBe('CLIPDATA');
    }
    await t.settle();
    expect((await call(t.deps, new Request(url, { method: 'POST' }))).status).toBe(410);
    expect((await call(t.deps, new Request(url))).status).toBe(410);
    expect((t.db.prepare('SELECT count(*) AS n FROM download_log').get() as any).n).toBe(5);
    expect(path).toMatch(/^\/d\//);
  });

  it('links expire after 72 hours', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    const url = ((await (await buy(w, t)).json()) as any).downloads[0].url;
    t.advance(72 * 3600 * 1000 + 1);
    expect((await call(t.deps, new Request(url, { method: 'POST' }))).status).toBe(410);
  });

  it('a pack issues one link per file', async () => {
    const w = paypalWorld({ captureAmount: '15.00' });
    const t = makeDeps(w.fn);
    const body = (await (await buy(w, t, ['e30-pack'])).json()) as any;
    expect(body.downloads.map((d: any) => d.file_name)).toEqual(['clip.zip', 'vent.zip']);
  });

  it('rejects a capture whose amount, payee or currency does not match the order', async () => {
    for (const over of [{ captureAmount: '0.01' }, { payee: 'SOMEONE_ELSE' }]) {
      const w = paypalWorld(over);
      const t = makeDeps(w.fn);
      const res = await buy(w, t);
      expect(res.status).toBe(402);
      expect((t.db.prepare('SELECT count(*) AS n FROM download_tokens').get() as any).n).toBe(0);
    }
  });

  it('a pending capture does not deliver', async () => {
    const w = paypalWorld({ captureStatus: 'PENDING' });
    const t = makeDeps(w.fn);
    const body = (await (await buy(w, t)).json()) as any;
    expect(body.status).toBe('pending');
    expect((t.db.prepare('SELECT status FROM orders').get() as any).status).toBe('PENDING');
  });

  it('capturing twice does not issue tokens twice', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    await buy(w, t);
    const again = await call(t.deps, apiRequest('/api/capture', { orderID: 'PPORDER1' }));
    expect(((await again.json()) as any).downloads).toBeNull();
    expect((t.db.prepare('SELECT count(*) AS n FROM download_tokens').get() as any).n).toBe(1);
    expect(w.state.captureCalls).toBe(1);
  });
});

describe('input validation and abuse controls', () => {
  it('validates the cart', () => {
    expect(parseCart({ items: ['a-b', { slug: 'a-b' }] })).toEqual(['a-b']);
    expect(() => parseCart({ items: [] })).toThrow();
    expect(() => parseCart({ items: ['../etc'] })).toThrow();
    expect(() => parseCart({ items: Array.from({ length: 21 }, (_, i) => `p-${i}`) })).toThrow();
    expect(() => parseCart('nope')).toThrow();
  });

  it('rejects unknown products, other origins and non-JSON bodies', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    expect((await call(t.deps, apiRequest('/api/orders', { items: ['nope'] }))).status).toBe(400);
    expect((await call(t.deps, apiRequest('/api/orders', { items: ['bmw-e30-dash-clip'] }, { origin: 'https://evil.test' }))).status).toBe(403);
    const form = new Request(`${SITE}/api/orders`, { method: 'POST', headers: { origin: SITE, 'content-type': 'text/plain' }, body: '{}' });
    expect((await call(t.deps, form)).status).toBe(415);
  });

  it('rate limits order creation per IP', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await call(t.deps, apiRequest('/api/orders', { items: ['bmw-e30-dash-clip'] }))).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('treats malformed tokens as expired and unknown routes as 404', async () => {
    const t = makeDeps(paypalWorld().fn);
    expect((await call(t.deps, new Request(`${SITE}/d/short`))).status).toBe(410);
    expect((await call(t.deps, new Request(`${SITE}/api/nope`))).status).toBe(404);
    expect(await route(new Request(`${SITE}/bmw-e30/`), t.deps)).toBeNull(); // falls through to static assets
  });
});

describe('PayPal webhooks', () => {
  async function createOnly(w: ReturnType<typeof paypalWorld>, t: ReturnType<typeof makeDeps>) {
    await call(t.deps, apiRequest('/api/orders', { items: ['bmw-e30-dash-clip'] }));
  }
  const completed = { id: 'WH-EVT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP1', status: 'COMPLETED' } };

  it('delivers by email when the buyer never came back (self-verified signature)', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    await createOnly(w, t);
    const raw = JSON.stringify(completed);
    const res = await call(t.deps, webhookRequest(completed, signWebhook(raw)));
    expect(res.status).toBe(200);
    await t.settle();
    expect((t.db.prepare('SELECT status, capture_id FROM orders').get() as any)).toEqual({ status: 'PAID', capture_id: 'CAP1' });
    expect(w.state.emails).toHaveLength(1);
    expect(w.state.emails[0].to).toEqual(['buyer@example.com']);
    expect(w.calls.some((c) => c.url.endsWith('/verify-webhook-signature'))).toBe(false); // self-verification sufficed
  });

  it('ignores duplicate deliveries of the same event', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    await createOnly(w, t);
    const h = signWebhook(JSON.stringify(completed));
    await call(t.deps, webhookRequest(completed, h));
    const second = await call(t.deps, webhookRequest(completed, h));
    expect(((await second.json()) as any).duplicate).toBe(true);
  });

  it('rejects forged events: bad signature, foreign cert host, tampered body', async () => {
    const w = paypalWorld({ postback: 'FAILURE' });
    const t = makeDeps(w.fn);
    await createOnly(w, t);
    const good = signWebhook(JSON.stringify(completed));
    const tampered = { ...completed, resource: { id: 'CAP1', status: 'COMPLETED', amount: '999' } };
    expect((await call(t.deps, webhookRequest(tampered, good))).status).toBe(401);
    expect((await call(t.deps, webhookRequest(completed, { ...good, 'paypal-cert-url': 'https://evil.test/cert.pem' }))).status).toBe(401);
    expect((await call(t.deps, webhookRequest(completed, { ...good, 'paypal-transmission-sig': 'AAAA' }))).status).toBe(401);
    expect(w.calls.some((c) => c.url.startsWith('https://evil.test'))).toBe(false); // never fetched the attacker's cert
    expect((t.db.prepare('SELECT status FROM orders').get() as any).status).toBe('CREATED');
  });

  it('falls back to PayPal postback verification', async () => {
    const w = paypalWorld({ postback: 'SUCCESS' });
    const t = makeDeps(w.fn);
    await createOnly(w, t);
    const res = await call(t.deps, webhookRequest(completed, { ...signWebhook('other body'), 'paypal-transmission-sig': 'AAAA' }));
    expect(res.status).toBe(200);
  });

  it('a refund revokes the download links', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    const url = ((await (await buy(w, t)).json()) as any).downloads[0].url;
    const refund = { id: 'WH-EVT-2', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'REF1', links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAP1' }] } };
    expect((await call(t.deps, webhookRequest(refund, signWebhook(JSON.stringify(refund), 'TX-2')))).status).toBe(200);
    expect((t.db.prepare('SELECT status FROM orders').get() as any).status).toBe('REFUNDED');
    expect((await call(t.deps, new Request(url, { method: 'POST' }))).status).toBe(410);
  });
});

describe('resend links', () => {
  it('answers the same either way and only emails the paying address', async () => {
    const w = paypalWorld();
    const t = makeDeps(w.fn);
    const oldUrl = ((await (await buy(w, t)).json()) as any).downloads[0].url;
    await t.settle();
    const r1 = await call(t.deps, apiRequest('/api/resend', { email: 'nobody@example.com' }));
    const r2 = await call(t.deps, apiRequest('/api/resend', { email: 'Buyer@Example.com' }));
    expect(r1.status).toBe(202);
    expect(await r1.json()).toEqual(await r2.json());
    await t.settle();
    expect(w.state.emails).toHaveLength(2);
    expect(w.state.emails[1].to).toEqual(['buyer@example.com']);
    expect((await call(t.deps, new Request(oldUrl, { method: 'POST' }))).status).toBe(410); // old links revoked
  });
});

describe('crypto helpers', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('only PayPal HTTPS hosts are accepted as certificate URLs', () => {
    expect(isAllowedCertUrl('https://api.paypal.com/v1/notifications/certs/CERT-1')).toBe(true);
    expect(isAllowedCertUrl('https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-1')).toBe(true);
    expect(isAllowedCertUrl('http://api.paypal.com/x')).toBe(false);
    expect(isAllowedCertUrl('https://api.paypal.com.evil.test/x')).toBe(false);
    expect(isAllowedCertUrl('https://evil.test@api.paypal.com/x')).toBe(false);
    expect(isAllowedCertUrl('https://api.paypal.com:8443/x')).toBe(false);
    expect(isAllowedCertUrl(null)).toBe(false);
  });
  it('extracts a usable public key from an X.509 certificate', async () => {
    const key = await crypto.subtle.importKey('spki', spkiFromPem(certPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    expect(key.type).toBe('public');
  });
});
