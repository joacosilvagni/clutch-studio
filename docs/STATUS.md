# STATUS — tablero compartido entre agentes

Leelo antes de empezar y actualizalo al terminar (ver `AGENTS.md`).

## En curso

| Agente | Tarea | Rama | Desde |
| --- | --- | --- | --- |
| Claude (diseño) | Portadas, visor 3D y vitrina de los 73 productos | claude/media-3d | 2026-11-23 |

## Bloqueos

- Retiro de USD: PayPal exige una cuenta bancaria de EE.UU. a nombre del titular de la cuenta PayPal. Joaquín lo verifica antes de salir a producción.
- R2: falta activar la suscripción gratuita de R2 en Cloudflare (Joaquín, pantalla de pago); después se re-corre "Bootstrap Cloudflare". D1 ya está creada.

## Preguntas abiertas

- ¿Precio base por pieza y por pack? (propuesta: mínimo USD 8 por la comisión de PayPal).
- ¿Dominio definitivo? (necesario para Resend, PayPal y Cloudflare). Hoy `site/astro.config.mjs` usa example.com.
- ¿Política de devoluciones y plazos de envío de accesorios? Depende del proveedor de dropshipping; el sitio no promete nada hasta tenerla.
- ¿Qué precio tienen los accesorios y cómo se muestra el envío (incluido o calculado en el checkout)?
- Free Library (`free: true`): ¿descarga directa pública desde R2/estáticos, o pedir el mail y mandar un link? El Worker hoy no entrega gratuitos.
- Contrato frontend ↔ Worker: el carrito manda `{items:[{slug}]}` a `/api/orders`; `onApprove` manda `{orderID}` a `/api/capture` y muestra `downloads[]` (o el `message` si es `null`).

## Log de sesiones (lo más nuevo arriba)

### 2026-11-23 · Claude (dropshipping) — 10 accesorios físicos de CJ
- Hecho (rama `claude/project-thread-w0cows`): 10 productos `kind: physical` en `draft` (luces LED, tecnología, interior,
  detailing y un cartel de chapa), elegidos por demanda (ventas y puntaje en AliExpress, tiendas que lo listan y pedidos en CJ)
  y sin logos. Cada YAML trae `supplier` (CJ: pid, variante, costo, peso y envío cotizado a US/EU/AU con días y línea).
  Schema: `supplier` validado (solo físicos; destinos US/EU/AU, UK excluido), un físico aprobado exige costo, envío a los
  3 destinos e imágenes. Nueva categoría `wall-art-decor` (sitio y schema).
- Decisiones (Joaquín): sin saldo previo en CJ, cada pedido se paga con tarjeta al entrar la venta; destinos EE.UU., UE y
  Australia; Reino Unido afuera al lanzar (VAT desde la primera venta).
- Pendiente: Joaquín aprueba/descarta productos; re-cotizar envío de las variantes multipack (notas en cada YAML); bajar las
  imágenes del CDN de CJ a `site/public`; elegir líneas con tracking (PayPal lo exige); política de devoluciones y plazos.

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
