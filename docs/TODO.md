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
- [ ] Workflow programado semanal de reverificación que abra un issue si algo cambió
- [ ] Correr `import-seed` con `THINGIVERSE_TOKEN` para verificar autor/licencia/archivos de los 73 borradores
- [ ] Revisión manual de los borradores con flags (marcas, modelos fuera de lista, años)
- [ ] Escribir descripciones originales en inglés y fichas técnicas (material, parámetros, instalación)
- [ ] Armar packs por modelo (`kind: pack`)
- [ ] Preparar ZIPs listos para imprimir + `ATTRIBUTION.txt` y subirlos a R2 (`products/<slug>/...`)

## Fase 2 — MVP de la tienda
- [ ] Worker: `POST /api/orders`, `POST /api/capture`, webhook PayPal con verificación de firma
- [ ] Worker: descargas con token (72 h, 5 descargas), mail con Resend, reenvío de links, rate limiting
- [ ] Migraciones D1 y wrangler config (sin secretos)
- [x] Sitio: prototipo de home, departamentos, categorías, filtros, página por modelo, producto con atribución (Claude, PR #1)
- [ ] Sitio: carrito, checkout y confirmación conectados al Worker
- [ ] Free Library
- [ ] SEO: sitemap, metadatos, datos estructurados de producto, Open Graph
- [x] Páginas legales en borrador: términos, privacidad, devoluciones, no afiliación, créditos (Claude, PR #1)
- [ ] Revisar textos legales antes de producción
- [ ] Panel mínimo de órdenes (script local o página protegida con Cloudflare Access)
- [ ] CI: tests + validación de catálogo en cada PR; deploy a Cloudflare desde `main`
- [ ] Probar el flujo completo en PayPal sandbox (incluye ver si aparece el botón de tarjeta para comerciante AR)

## Fase 3 — Contenido para Facebook
- [ ] Script que genere posts en inglés por producto/pack, variados, no spam
- [ ] Registro de grupos (lista de Joaquín) y de dónde/cuándo se publicó

## Fase 4 — Dropshipping
- [ ] Investigar proveedores con API (CJ Dropshipping, AliExpress vía DSers): envíos a EE.UU./UE, calidad, integración con PayPal
- [ ] Productos `kind: physical` sin logos, margen configurable, envío automático del pedido
- [ ] Schema: categorías de accesorios y `fits: []` = universal para físicos (el sitio ya las soporta)

## Antes de producción
- [ ] Cuenta bancaria de EE.UU. a nombre del titular de PayPal
- [ ] Consultar con contador: exportación de servicios (factura E, ARCA)
- [ ] Dominio + SPF/DKIM/DMARC para Resend
