# STATUS — tablero compartido entre agentes

Leelo antes de empezar y actualizalo al terminar (ver `AGENTS.md`).

## En curso

| Agente | Tarea | Rama | Desde |
| --- | --- | --- | --- |

## Bloqueos

- Retiro de USD: PayPal exige una cuenta bancaria de EE.UU. a nombre del titular de la cuenta PayPal. Joaquín lo verifica antes de salir a producción.
- Dominio definitivo: hace falta para Resend (SPF/DKIM/DMARC) y para producción. Hoy `site/astro.config.mjs` usa example.com.
- Thingiverse API devuelve 403 (app en cola de aprobación): la licencia se verifica a mano en la página de cada thing.

## Esperando revisión de Joaquín

- PR #7 (`claude/project-thread-w0cows`): 10 accesorios físicos de CJ en `draft` con bloque `supplier`; 7 aprobados en el chat. Pendiente: envío del OBD2 a Australia, recotizar multipacks.
- PR #8 (`claude/project-thread-3f4aeg`): 42 piezas 3D nuevas en `draft` (faltan `file_names`, imágenes, portadas y textos).
- Compra de prueba sandbox de punta a punta: falta pagar en el popup de PayPal sandbox (Joaquín) y registrar el resultado.
- PR #9 (`claude/project-thread-hvdo7j`): checkout de físicos. Antes de mergear, cargar los secrets `ORDER_NOTIFY_TO` y `ADMIN_TOKEN` en GitHub.

## Preguntas abiertas

- ¿CJ exige teléfono del destinatario? PayPal no lo comparte; si hace falta, se pide en el carrito antes de pagar.

- ¿Precio base por pieza y por pack? (propuesta: mínimo USD 8 por la comisión de PayPal).
- ¿Dominio definitivo? (necesario para Resend, PayPal y Cloudflare). Hoy `site/astro.config.mjs` usa example.com.
- ¿Política de devoluciones y plazos de envío de accesorios? Depende del proveedor de dropshipping; el sitio no promete nada hasta tenerla.
- Free Library (`free: true`): ¿descarga directa pública desde R2/estáticos, o pedir el mail y mandar un link? El Worker hoy no entrega gratuitos.
- Contrato frontend ↔ Worker: el carrito manda `{items:[{slug}]}` a `/api/orders`; `onApprove` manda `{orderID}` a `/api/capture` y muestra `downloads[]` (o el `message` si es `null`).

## Log de sesiones (lo más nuevo arriba)

### 2026-11-28 · Claude — Archivos 3D a la venta
- Causa del "Coming soon": los 70 archivos estaban en `preview` (sin precio, sin archivo en R2, sin descripción ni
  `verified_at`). Los STL originales están en la PC de Joaquín: `Downloads\modelos-autos-3d\<Marca>\<título> - <id>\files\`
  (`media_tienda\modelos` solo tiene GLB de vista previa).
- Hecho (rama `claude/project-thread-skk6lm`): un ZIP por pieza (STL originales + LICENSE.txt + ATTRIBUTION.txt) subido al
  bucket privado como `products/<slug>/<slug>.zip` con el workflow nuevo `upload-product-files.yml` (los ZIP se commitean
  un rato en una rama de trabajo y se sacan antes del PR; CI rechaza `r2-upload/`). Licencia y autor verificados contra el
  LICENSE.txt de cada paquete (52 CC BY, 17 CC BY-SA, 1 CC0, todos coinciden); descripción en inglés generada desde la
  ficha; flags de revisión ya resueltos por #11 limpiados. Precio USD 9.00 (Joaquín). Las 70 pasan a `approved` con OK de Joaquín en el chat.
- Pendiente: PayPal sigue en sandbox (`PAYPAL_ENV` y `vars.SANDBOX`): para cobrar de verdad hay que pasar a live (bloqueo
  de la cuenta bancaria). Los 3 borradores por logos (VW knob, Miata knob, Ronal) y las 42 piezas de PR #8 siguen sin vender.
- Decisión: los ZIP se generan con `Downloads\modelos-autos-3d\_clutch_r2\build.py` (en la PC de Joaquín), no se guardan en el repo.

### 2026-11-28 · Claude — Compatibilidad multi-modelo
- Hecho (rama `claude/project-thread-gvep9u`): cada entrada de `fits` acepta `model` (nombre visible, obligatorio si el
  `model_slug` no está en la lista de modelos), `note` y `unconfirmed: true` ("may also fit", se muestra aparte y no cuenta
  para aprobar ni para `/fits/`); campo nuevo `fitment_note` por producto. La ficha lista todos los autos y las tarjetas
  dicen "Fits N models". 33 piezas actualizadas con lo que dice la descripción original de cada thing
  (`media_tienda/creditos/<id>/README.txt`). Ej.: manija de espejo Mercedes → W124, W123, W201, W126; switch blank VW →
  Golf Mk1, Jetta Mk1, Passat B1, LT Mk1; tapa de motor BMW → E34/E36/E38/E39/E46/E60 con M50/M52/M54.
- Correcciones que salieron de la fuente: el "Beetle armrest handle" es del **New Beetle** y el "antenna cap" es del
  **MX-5 NC** (títulos corregidos, slugs sin cambiar); años más angostos en XJ stereo bracket (97–01), XJ cup holders
  (84–96), XJ ash tray plate (97–01), Miata gauge panel (NA), perilla C10 (1978, sin probar en otros años), buje Saab (900 90–94 + 9000).
- Sin confirmar (marcadas `unconfirmed`): W124 en el tirador del capó, Jetta Mk2/Mk3/Mk4 en piezas de Golf.
- Pendiente: los modelos nuevos (W124, NC, New Beetle…) no tienen página `/fits/`; sumarlos a `models.yaml`/`catalog.ts`
  si Joaquín quiere. PR #8 (42 piezas nuevas) no tiene esta info todavía.

### 2026-11-26 · Claude (backend) — Checkout de físicos
- Hecho (rama `claude/project-thread-hvdo7j`, PR #9): STATUS al día; físicos aprobados entran al catálogo del Worker con
  zonas y datos de `supplier` (compatible con #7); PayPal con dirección (`GET_FROM_FILE`, envío incluido); país validado
  antes de capturar (US/UE-27/AU + rutas del producto) y en el popup (`onShippingAddressChange`); migración D1
  `0002_fulfillment.sql`; mail a Joaquín con lo que hay que comprar en CJ y confirmación al comprador sin plazos;
  carrito mixto; `/api/admin/*` + `npm run fulfillment` para cargar pedido CJ y tracking (PayPal `trackers-batch`);
  reembolso cancela o alerta. Producto `sandbox-test-physical` (USD 1, solo sandbox). 19 tests nuevos (66 en total).
- Pendiente: secrets `ORDER_NOTIFY_TO` y `ADMIN_TOKEN` (Joaquín, en GitHub Actions); prueba sandbox física y digital;
  cantidades > 1; teléfono del comprador si CJ lo exige (PayPal no lo pasa).
- Decisiones: ver `docs/DECISIONS.md` (2026-11-26).
- Preguntas para Joaquín: ¿alcanza con que CJ use el mail del comprador, o pedimos teléfono en el sitio antes de pagar?

### 2026-11-23 · Claude (diseño) — Portadas y 3D
- Hecho (rama `claude/media-3d`): 72 portadas y 111 GLB de `media_tienda` emparejados por id de Thingiverse (73/73, sin huérfanos);
  pestaña "View in 3D" con `<model-viewer>` (carga diferida, variantes, pausa, reset, reduced motion, error y sin WebGL);
  author/author_url completados desde `creditos/<id>/README.txt`; reemplazan las 18 imágenes asignadas a ojo (borradas).
  Estado `preview`: 70 productos visibles como "Coming soon"; 3 quedan en draft por logos (VW, "miata", Ronal).
- Pendiente: precios, archivos en R2 y verificación de licencia para pasar a `approved`; portada de 6808654 (generación bloqueada).

### 2026-11-23 · Claude (diseño) — Rediseño
- Hecho (rama `claude/site-redesign`): rediseño visual del sitio centrado en las imágenes; 18 imágenes de Joaquín
  (renders ilustrativos) en `site/public/images/products/` (WebP 1200 y 600 px) y cargadas en `images[]` de 18 borradores;
  insignia "Instant download" en tarjetas, ficha, header y home; `BuyBox` con botones `[data-buy-now]` y `[data-add-to-cart]`
  (con `data-slug`) para que el script de checkout los conecte; barra de compra fija en mobile.
- Pendiente: conectar los botones al carrito (lo hace el hilo de backend en `scripts/cart.ts`), revisar en pantalla cart/order.
- Preguntas: confirmar con Joaquín que la asignación imagen→producto es correcta (la hice a ojo por la forma de cada pieza).

### 2026-11-22 · Claude (backend) — Infra
- Hecho: PR #2 mergeado. App sandbox de PayPal "Clutch Studio" (Client ID público en `worker/wrangler.jsonc`), app de Thingiverse
  "Clutch Studio catalog", token de Cloudflare "clutch-studio GitHub Actions" (solo la cuenta: Workers, D1, R2; sin zona).
  Secrets de GitHub: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `PAYPAL_CLIENT_SECRET`, `THINGIVERSE_TOKEN`.
  R2 activado (plan gratis). "Bootstrap Cloudflare" OK: D1 `clutch-studio`, bucket privado `clutch-studio-files`, migraciones aplicadas.
- Pendiente: "Verify seed drafts" corrió pero la API de Thingiverse devolvió 403 (la app nueva parece estar en cola de aprobación);
  re-correrlo cuando la aprueben. La rama `bot/verify-seed-20261123-0018` no sirve (solo flags de error), se puede borrar.
  Faltan `PAYPAL_WEBHOOK_ID` y `RESEND_API_KEY` (necesitan dominio) y `vars.DEPLOY_ENABLED=true` para el deploy.
- Nota: los agentes no cargan secretos en formularios; los pega Joaquín.

### 2026-11-22 · Claude (diseño)
- Hecho: prototipo del sitio en `site/` (PR #1). Marca provisoria Clutch Studio (`site/src/data/brand.ts`), paleta oscura,
  navegación por categorías con dos departamentos (Accesorios físicos como protagonista y Archivos 3D), el auto como
  filtro secundario (`/fits/<modelo>/`), ficha de producto que se adapta a físico o archivo, reseñas solo de compradores
  verificados con estado vacío (sin reseñas inventadas), legales en borrador. Lee `catalog/products/*.yaml` con una
  content collection; producción lista solo `approved`, los borradores se ven en `npm run dev` o con `PUBLIC_SHOW_DRAFTS=true`.
- Pendiente: carrito conectado a `/api/orders` (solo slugs y cantidades), fotos/renders reales, formulario de pedido de piezas,
  sitemap, dominio real en `astro.config.mjs`, textos legales revisados.
- Decisiones: ver `docs/DECISIONS.md` (navegación por categorías).
- Para el schema (`pipeline/`, área backend): agregar las categorías de accesorios (`interior-comfort`, `phone-tech`,
  `lighting-electrical`, `detailing-care`, `garage-tools`, `exterior-protection`), permitir `fits: []` en físicos
  (= universal) y `free: true` para la Free Library. Las URLs de producto ahora son `/products/<slug>/`.

### 2026-11-22 · Claude (backend) — Worker
- Hecho (rama `claude/worker-checkout`): Worker con `/api/orders`, `/api/capture`, `/api/resend`, webhook de PayPal
  (verificación propia con allowlist del certificado + postback de respaldo, dedupe de eventos, relectura de la captura),
  descargas `/d/<token>` (GET página, POST consume, atómico, log de entrega), mail con Resend, rate limit en D1,
  migración D1, `wrangler.jsonc` sin secretos, `free: true` en el schema, workflows de CI, deploy y reverificación,
  README. 42 tests pasando, `tsc` y `wrangler deploy --dry-run` OK.
- Pendiente: recursos reales en Cloudflare y credenciales sandbox de PayPal para probar punta a punta; integración del carrito en `site/`.
- Decisiones: GET de descarga no consume (escáneres de mail); un token por archivo; packs entregan los archivos de sus piezas.

### 2026-11-22 · Claude (backend)
- Hecho: Fase 0 (informe de viabilidad), schema de producto, pipeline de catálogo (`import-seed`, `search`,
  `verify-licenses`, `validate`, `build-catalog`), 73 borradores importados del CSV semilla, tests del pipeline.
- Pendiente: Worker (checkout, captura, webhook, descargas, mail, rate limit), workflows de CI, README.
- Decisiones: ver `docs/DECISIONS.md` (todas las del 2026-11-22).
- Preguntas: ver arriba.
