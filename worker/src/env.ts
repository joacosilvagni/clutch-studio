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
  /** secret; optional once Gmail is configured (then it is only the fallback) */
  RESEND_API_KEY?: string;
  /** secret: Gmail address that sends transactional mail (SMTP with an app password) */
  GMAIL_USER?: string;
  /** secret: 16-character Google app password for GMAIL_USER */
  GMAIL_APP_PASSWORD?: string;
  MAIL_FROM: string;
  /** Sandbox only: deliver every email here instead of the PayPal sandbox buyer's fake address. Ignored in live. */
  MAIL_SANDBOX_TO?: string;
  SITE_URL: string;
  DOWNLOAD_TTL_HOURS?: string;
  DOWNLOAD_MAX?: string;
  /** secret (private address): where new physical orders are sent to be bought from the supplier. */
  ORDER_NOTIFY_TO?: string;
  /** secret: bearer token for /api/admin/* (fulfillment list, supplier order, tracking). Unset = admin API off. */
  ADMIN_TOKEN?: string;
}

export interface CatalogFile {
  r2_key: string;
  name: string;
}

export type ShipDestination = 'US' | 'EU' | 'AU';

/** How a physical product is bought from the supplier. Compiled from `supplier` in the YAML; never sent to browsers. */
export interface CatalogSupplier {
  platform: string | null;
  product_url: string;
  pid: string | null;
  variant: string | null;
  cost_usd: string;
  shipping: Partial<Record<ShipDestination, { method: string | null; cost_usd: string }>>;
}

export interface CatalogProduct {
  slug: string;
  title: string;
  price_cents: number;
  files: CatalogFile[];
  /** absent = digital (file or pack) */
  kind?: 'physical';
  /** physical only: zones this product can ship to */
  ship_to?: ShipDestination[];
  /** physical only; null for sandbox test products */
  supplier?: CatalogSupplier | null;
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
