# Decisiones de arquitectura

Formato: fecha · decisión · por qué. Las más nuevas arriba. No re-discutir sin un dato nuevo.

- **2026-11-26 · Checkout de físicos: envío incluido en el precio y fulfillment manual.** PayPal pide la dirección
  (`GET_FROM_FILE`) solo si hay físicos; sin línea de envío. El país se valida en el servidor **antes** de capturar
  (US, UE-27, AU y las rutas de `supplier.shipping` de cada producto); si igual entra un pago a un destino inválido,
  el envío queda `BLOCKED` para reembolsar. Sin API de pedidos de CJ ni saldo prefondeado (decisión del 23/11): mail a
  Joaquín con los datos y API admin (`ADMIN_TOKEN`) para cargar pedido CJ y tracking (PayPal `trackers-batch`,
  `notify_buyer`). Tabla `fulfillments` en D1 (migración 0002). El build falla si un físico aprobado no tiene rutas,
  costos, o deja menos de USD 10 netos en la ruta más cara (comisión 5,4% + 0,30).

- **2026-11-23 · Nuevo estado `preview` (vitrina).** Joaquín pidió mostrar todos los productos con sus fotos. `approved`
  exige precio, archivos en R2 y licencia verificada, y es lo único que el Worker vende; `preview` se lista en el sitio con
  portada y visor 3D pero nunca se vende ("Coming soon"). Exige title, category, licencia permitida y author.
  Quedan en `draft` los que muestran marcas del fabricante (VW, "miata", Ronal/Saab).
- **2026-11-23 · Portadas y visor 3D desde `media_tienda`.** Portadas WebP en `site/public/media/portadas/<thing_id>.webp`
  (+ `-sm`), GLB en `site/public/media/modelos/`, mapa en `site/src/data/media.json` (por id de Thingiverse).
  `<model-viewer>` 4.1.0 local, se carga solo al abrir "View in 3D".
- **2026-11-22 · Sitio organizado por categorías, no por auto.** Pocas veces vamos a tener la pieza para el auto exacto
  del comprador, así que la navegación principal es por departamento y categoría. Dos departamentos: Accesorios
  (físicos, dropshipping, protagonista) y Archivos 3D. El auto queda como filtro secundario y en `/fits/<modelo>/` para SEO.
  Producto en `/products/<slug>/`. Pedido por Joaquín.
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

## 2026-11-23 — Dropshipping
- Proveedor: CJ Dropshipping (API documentada para pedidos, envíos y tracking; IOSS propio para la UE). AliExpress se usa
  para medir demanda.
- Sin saldo prefondeado en CJ: cada pedido se paga con tarjeta recién cuando entra la venta (decisión de Joaquín).
- Destinos de físicos: EE.UU., UE y Australia. Reino Unido excluido al lanzar (registro de VAT desde la primera venta ≤ £135).
- Precio con envío incluido; margen calculado contra el envío más caro de los 3 destinos más la comisión de PayPal.
- El costo y el envío del proveedor viven en `supplier` del YAML y nunca se muestran en el sitio.
- Piso de ganancia: cada producto físico debe dejar al menos USD 10 netos por pedido (después del envío más caro y PayPal).
  Se subieron precios de los que no llegaban (decisión de Joaquín, 23/11).
- Pósters: DESCARTADOS por Joaquín (23/11). Queda en el schema el campo `artwork` y `printful` como proveedor por si se retoma.
  Lo que se había probado: impresión bajo demanda en Printful con fotos de Wikimedia Commons bajo CC0, CC BY o CC BY-SA
  (Unsplash y Pexels prohíben vender copias sin cambios). La foto se acredita en el campo `artwork` y en la página del
  producto, con aviso de que no es oficial. Antes de imprimir se borran patentes y se retocan emblemas visibles.

## 2026-11-28 — Compatibilidad con varios autos
- Un auto se lista como compatible solo si lo dice la publicación original o es un cruce verificable; lo plausible va con
  `unconfirmed: true` y se muestra como "May also fit (not confirmed by the designer)". Nunca se inventa compatibilidad.
- Autos fuera de la lista de modelos se cargan igual en `fits` con `model` (texto); no generan página `/fits/`.
