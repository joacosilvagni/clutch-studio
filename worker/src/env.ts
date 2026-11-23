export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  PAYPAL_ENV: 'sandbox' | 'live';
  PAYPAL_CLIENT_ID: string;
  /** secret */
  PAYPAL_CLIENT_SECRET: string;
  /** secret: id of the webhook registered in the PayPal developer dashboard */
  PAYPAL_WEBHOOK_ID: string;
  /** optional: if set, captures paid to any other merchant are rejected */
  PAYPAL_MERCHANT_ID?: string;
  /** secret */
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  SITE_URL: string;
  DOWNLOAD_TTL_HOURS?: string;
  DOWNLOAD_MAX?: string;
}

export interface CatalogFile {
  r2_key: string;
  name: string;
}

export interface CatalogProduct {
  slug: string;
  title: string;
  price_cents: number;
  files: CatalogFile[];
}

export interface Catalog {
  currency: 'USD';
  products: Record<string, CatalogProduct>;
}

/** Everything a handler needs; injected so tests can replace network, clock and catalog. */
export interface Deps {
  env: Env;
  catalog: Catalog;
  fetch: typeof fetch;
  now: () => number;
  waitUntil: (p: Promise<unknown>) => void;
}
