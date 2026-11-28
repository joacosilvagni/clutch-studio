-- Physical goods: one fulfillment per order that contains at least one physical item.
-- Supplier purchases (CJ) are made by hand with a card; this table tracks them until delivery.
CREATE TABLE fulfillments (
  order_id TEXT PRIMARY KEY REFERENCES orders (id),
  status TEXT NOT NULL CHECK (status IN ('AWAITING_PAYMENT', 'PENDING', 'ORDERED', 'SHIPPED', 'BLOCKED', 'CANCELLED')),
  items_json TEXT NOT NULL,                  -- [{slug, title, qty}] physical items only
  destination TEXT,                          -- US | EU | AU
  ship_name TEXT,
  address_json TEXT,                         -- ShippingAddress as PayPal collected it
  country_code TEXT,
  supplier_order_ref TEXT,                   -- CJ order number, once bought
  carrier TEXT,
  tracking_number TEXT,
  paypal_tracker_status TEXT,                -- sent | failed
  notified_at INTEGER,                       -- ops email to Joaquín sent
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX fulfillments_status ON fulfillments (status, created_at);
