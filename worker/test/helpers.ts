// Test doubles: a D1 binding over node:sqlite (real SQL, real migrations), an in-memory R2,
// and a scripted fetch for PayPal / Resend.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Catalog, Deps, Env } from '../src/env';

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args);
  }
  private conv() {
    return this.args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a)) as any[];
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.conv()) as any;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.conv()).map((r: any) => ({ ...r })) as T[], success: true };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.conv());
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url)), 'utf8'));
  const binding = {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { binding: binding as unknown as D1Database, raw: db };
}

export function fakeR2(objects: Record<string, string>) {
  return {
    async get(key: string) {
      if (!(key in objects)) return null;
      const bytes = new TextEncoder().encode(objects[key]);
      return { body: new Blob([bytes]).stream(), size: bytes.byteLength };
    },
  } as unknown as R2Bucket;
}

export type Route = (url: string, init: RequestInit) => Response | Promise<Response> | undefined;

export function scriptedFetch(routes: Route[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    for (const r of routes) {
      const res = await r(url, init);
      if (res) return res;
    }
    throw new Error(`unexpected fetch ${init.method ?? 'GET'} ${url}`);
  }) as typeof fetch;
  return { fn, calls };
}

export const SITE = 'https://shop.test';

export const catalog: Catalog = {
  currency: 'USD',
  products: {
    'bmw-e30-dash-clip': { slug: 'bmw-e30-dash-clip', title: 'Dash clip for BMW E30', price_cents: 800, files: [{ r2_key: 'products/bmw-e30-dash-clip/clip.zip', name: 'clip.zip' }] },
    'e30-pack': {
      slug: 'e30-pack', title: 'E30 Interior Pack', price_cents: 1500,
      files: [{ r2_key: 'products/bmw-e30-dash-clip/clip.zip', name: 'clip.zip' }, { r2_key: 'products/bmw-e30-vent/vent.zip', name: 'vent.zip' }],
    },
  },
};

export function makeDeps(fetchFn: typeof fetch, over: Partial<Env> = {}) {
  const d1 = fakeD1();
  const pending: Promise<unknown>[] = [];
  let clock = Date.parse('2026-11-22T12:00:00Z');
  const env: Env = {
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    DB: d1.binding,
    FILES: fakeR2({ 'products/bmw-e30-dash-clip/clip.zip': 'CLIPDATA', 'products/bmw-e30-vent/vent.zip': 'VENTDATA' }),
    PAYPAL_ENV: 'sandbox',
    PAYPAL_CLIENT_ID: 'cid',
    PAYPAL_CLIENT_SECRET: 'csecret',
    PAYPAL_WEBHOOK_ID: 'WH-1',
    PAYPAL_MERCHANT_ID: 'MERCHANT1',
    RESEND_API_KEY: 're_test',
    MAIL_FROM: 'Clutch Studio <orders@shop.test>',
    SITE_URL: SITE,
    ...over,
  };
  const deps: Deps = {
    env,
    catalog,
    fetch: fetchFn,
    now: () => clock,
    waitUntil: (p) => void pending.push(p),
  };
  return {
    deps,
    db: d1.raw,
    advance: (ms: number) => void (clock += ms),
    settle: () => Promise.all(pending.splice(0)),
  };
}

export function apiRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, 'cf-connecting-ip': '203.0.113.7', ...headers },
    body: JSON.stringify(body),
  });
}
