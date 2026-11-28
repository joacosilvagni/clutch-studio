#!/usr/bin/env node
// Pedidos físicos desde la terminal (habla con /api/admin/* del Worker).
//   ADMIN_TOKEN=... npm run fulfillment -- list [PENDING|ORDERED|SHIPPED|BLOCKED|CANCELLED]
//   ADMIN_TOKEN=... npm run fulfillment -- ordered <orden> <nro de pedido CJ>
//   ADMIN_TOKEN=... npm run fulfillment -- shipped <orden> <CARRIER> <tracking> [nombre si CARRIER=OTHER]
// CARRIER es el código de PayPal (USPS, DHL, YANWEN, CHINA_POST, 4PX, ...; OTHER + nombre si no está).
// ADMIN_TOKEN es el mismo valor que cargaste con `wrangler secret put ADMIN_TOKEN`: no lo guardes en el repo.
// SHOP_URL cambia el destino (por defecto el deploy de workers.dev).
const base = (process.env.SHOP_URL ?? 'https://clutch-studio.joaquinsilvagni.workers.dev').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN;
const [cmd, ...args] = process.argv.slice(2);

function usage() {
  console.error('uso: fulfillment list [estado] | ordered <orden> <ref> | shipped <orden> <CARRIER> <tracking> [nombre]');
  process.exit(2);
}
if (!token) {
  console.error('Falta ADMIN_TOKEN en el entorno.');
  process.exit(2);
}

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ ${res.status} ${data.error ?? ''} ${data.message && data.message !== data.error ? data.message : ''}`);
    process.exit(1);
  }
  return data;
}

if (cmd === 'list') {
  const q = args[0] ? `?status=${encodeURIComponent(args[0].toUpperCase())}` : '';
  const { fulfillments } = await call('GET', `/api/admin/fulfillments${q}`);
  if (!fulfillments.length) console.log('Sin pedidos.');
  for (const f of fulfillments) {
    console.log(`\n${f.order_id}  ${f.status}  ${f.created_at.slice(0, 16).replace('T', ' ')}  ${f.destination ?? ''}`);
    for (const i of f.items) console.log(`  - ${i.title}${i.qty > 1 ? ` ×${i.qty}` : ''}`);
    if (f.address) console.log(`  ${[f.address.name, f.address.line1, f.address.line2, f.address.city, f.address.state, f.address.postal_code, f.address.country_code].filter(Boolean).join(', ')}`);
    if (f.payer_email) console.log(`  ${f.payer_email}`);
    if (f.supplier_order_ref) console.log(`  CJ: ${f.supplier_order_ref}`);
    if (f.tracking_number) console.log(`  tracking: ${f.carrier} ${f.tracking_number} (PayPal: ${f.paypal_tracker_status ?? '-'})`);
  }
} else if (cmd === 'ordered') {
  const [order_id, supplier_order_ref] = args;
  if (!order_id || !supplier_order_ref) usage();
  await call('POST', '/api/admin/fulfillment', { order_id, action: 'ordered', supplier_order_ref });
  console.log('✓ Marcado como comprado en CJ.');
} else if (cmd === 'shipped') {
  const [order_id, carrier, tracking_number, carrier_name_other] = args;
  if (!order_id || !carrier || !tracking_number) usage();
  const r = await call('POST', '/api/admin/fulfillment', { order_id, action: 'shipped', carrier, tracking_number, carrier_name_other });
  console.log(r.paypal_tracker === 'sent' ? '✓ Enviado: tracking cargado en PayPal y mail al comprador.' : `! Guardado, pero PayPal rechazó el tracking (${r.detail}). Corregí y repetí el comando.`);
} else usage();
