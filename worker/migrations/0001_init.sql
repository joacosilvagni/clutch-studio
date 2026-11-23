-- Orders, download tokens, delivery log, processed webhooks and rate-limit counters.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,                       -- our uuid; sent to PayPal as custom_id and invoice_id
  paypal_order_id TEXT UNIQUE,
  capture_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'REFUNDED', 'REVERSED', 'DENIED')),
  currency TEXT NOT NULL DEFAULT 'USD',
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  items_json TEXT NOT NULL,                  -- [{slug, title, price_cents}] priced by the server
  payer_email TEXT,
  email_status TEXT,                         -- sent | failed
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX orders_payer_email ON orders (payer_email, paid_at);

CREATE TABLE download_tokens (
  token_hash TEXT PRIMARY KEY,               -- sha256(token); the token itself is never stored
  order_id TEXT NOT NULL REFERENCES orders (id),
  product_slug TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX download_tokens_order ON download_tokens (order_id);

CREATE TABLE download_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,
  order_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  user_agent TEXT
);
CREATE INDEX download_log_order ON download_log (order_id);

CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  received_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
