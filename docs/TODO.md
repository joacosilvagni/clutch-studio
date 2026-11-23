# TODO por fase

Marcá `[x]` al terminar y poné tu agente entre paréntesis si la tomaste. Reclamá en `docs/STATUS.md` antes de empezar.

## Fase 0 — Verificación
- [x] Informe de viabilidad (PayPal AR, stack, límites, mail) (Claude)
- [x] Decisión de hosting: Cloudflare Workers Static Assets (Joaquín)

## Fase 1 — Pipeline de catálogo
- [x] Schema de producto y validador (`pipeline/src/schema.mjs`) (Claude)
- [x] Importar CSV semilla como borradores (Claude)
- [x] Búsqueda en Thingiverse por modelo con filtro de licencias/adornos/logos, export CSV y borradores (Claude)
- [x] Reverificación de licencias con exit code ≠ 0 si algo cambió (Claude)
- [x] Workflow programado semanal de reverificación que abra un issue si algo cambió (Claude)
- [ ] Correr `import-seed` con `THINGIVERSE_TOKEN` para verificar autor/licencia/archivos de los 73 borradores
- [ ] Revisión manual de los borradores con flags (marcas, modelos fuera de lista, años)
- [ ] Escribir descripciones originales en inglés y fichas técnicas (material, parámetros, instalación)
- [ ] Armar packs por modelo (`kind: pack`)
- [ ] Preparar ZIPs listos para imprimir + `ATTRIBUTION.txt` y subirlos a R2 (`products/<slug>/...`)

## Fase 2 — MVP de la tienda
- [x] Worker: `POST /api/orders`, `POST /api/capture`, webhook PayPal con verificación de firma (Claude)
- [x] Worker: descargas con token (72 h, 5 descargas), mail con Resend, reenvío de links, rate limiting (Claude)
- [x] Migraciones D1 y wrangler config (sin secretos) (Claude)
- [x] Crear D1, R2 y secrets; `PAYPAL_CLIENT_ID` sandbox (Claude)
- [ ] Completar `SITE_URL`, `MAIL_FROM`, `PAYPAL_WEBHOOK_ID`, `RESEND_API_KEY` (necesitan dominio)
- [x] Sitio: prototipo de home, departamentos, categorías, filtros, página por modelo, producto con atribución (Claude, PR #1)
- [ ] Sitio: conectar carrito y botones de PayPal a `/api/orders` y `/api/capture`; página `/downloads/` que llame a `/api/resend`
- [ ] Definir cómo se entregan los productos `free: true` de la Free Library
- [ ] Free Library
- [ ] SEO: sitemap, metadatos, datos estructurados de producto, Open Graph
- [x] Páginas legales en borrador: términos, privacidad, devoluciones, no afiliación, créditos (Claude, PR #1)
- [ ] Revisar textos legales antes de producción
- [ ] Panel mínimo de órdenes (script local o página protegida con Cloudflare Access)
- [x] CI: tests + validación de catálogo en cada PR; deploy a Cloudflare desde `main` (activar con `DEPLOY_ENABLED`) (Claude)
- [ ] Probar el flujo completo en PayPal sandbox (incluye ver si aparece el botón de tarjeta para comerciante AR)

## Fase 3 — Contenido para Facebook
- [ ] Script que genere posts en inglés por producto/pack, variados, no spam
- [ ] Registro de grupos (lista de Joaquín) y de dónde/cuándo se publicó

## Fase 4 — Dropshipping
- [x] Investigar proveedores con API: elegido CJ Dropshipping (plan del 2026-11-23)
- [x] Primeros 10 accesorios en draft con costo y envío cotizado (US/EU/AU)
- [ ] Aprobar productos, bajar imágenes a site/public, re-cotizar multipacks, elegir líneas con tracking
- [ ] Productos `kind: physical` sin logos, margen configurable, envío automático del pedido
- [x] Schema: categorías de accesorios, `fits: []` = universal, `supplier` y `wall-art-decor`

## Antes de producción
- [ ] Cuenta bancaria de EE.UU. a nombre del titular de PayPal
- [ ] Consultar con contador: exportación de servicios (factura E, ARCA)
- [ ] Dominio + SPF/DKIM/DMARC para Resend
