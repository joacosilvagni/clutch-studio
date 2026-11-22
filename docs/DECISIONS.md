# Decisiones de arquitectura

Formato: fecha · decisión · por qué. Las más nuevas arriba. No re-discutir sin un dato nuevo.

- **2026-11-22 · Hosting en Cloudflare Workers Static Assets, no GitHub Pages.** Los términos de GitHub Pages
  prohíben usarlo para e-commerce. El Worker sirve `site/dist` y la API en el mismo dominio (sin CORS).
  Build y deploy desde GitHub Actions con `wrangler`. Aprobado por Joaquín.
- **2026-11-22 · Pagos con PayPal Checkout (JS SDK + Orders v2).** Cuenta Business argentina: 5,40% + USD 0,30
  por venta. Retiro en USD solo a cuenta bancaria de EE.UU. **a nombre del titular de PayPal** (pendiente de resolver).
- **2026-11-22 · D1 para órdenes, tokens, log de descargas y rate limit; KV no.** KV gratis permite 1.000
  escrituras/día y es eventualmente consistente (rompe el contador de descargas).
- **2026-11-22 · Verificación de webhooks propia (CRC32 + certificado) con allowlist de `cert_url`,
  y postback a `verify-webhook-signature` como respaldo.** Aun con firma válida, se relee la captura por API.
- **2026-11-22 · Token de descarga opaco (32 bytes), en D1 solo su SHA-256.** 72 h, 5 descargas, descuento atómico.
  GET muestra una página; la descarga se consume con POST (los escáneres de mail no queman descargas).
- **2026-11-22 · Mail con Resend vía `fetch`.** Gratis 100/día y 3.000/mes. Cloudflare Email Service requiere Workers Paid.
- **2026-11-22 · Catálogo: un YAML por producto en `catalog/products/`, `status: draft | approved`.**
  `kind: file | pack | physical`, `fits[]` con `{make, model_slug, years}`. Esquema en `pipeline/src/schema.mjs`.
  El Worker solo conoce productos aprobados (compilados a `worker/src/generated/catalog.json`).
- **2026-11-22 · Licencias aceptadas: CC BY, CC BY-SA, CC0.** NC y ND excluidas. BY-SA obliga a publicar
  el archivo adaptado bajo BY-SA.
