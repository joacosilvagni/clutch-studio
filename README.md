# Clutch Studio

Tienda online (100% en inglés) de archivos 3D listos para imprimir (STL/3MF) para autos clásicos y youngtimers.
Público: EE.UU., Reino Unido, Europa y Australia. Más adelante: dropshipping de accesorios.

> **Agentes (Claude, Codex): leé `AGENTS.md` antes de tocar nada.** El estado vivo está en `docs/STATUS.md`,
> las tareas en `docs/TODO.md` y las decisiones en `docs/DECISIONS.md`.

## Arquitectura

```
Navegador ──► Cloudflare (un dominio)
               ├─ Workers Static Assets: sitio Astro (site/dist)            gratis e ilimitado
               └─ Worker (worker/): /api/orders  /api/capture  /api/resend
                                    /api/paypal/webhook   /d/<token>
                     ├─ D1: órdenes, tokens (hash), log de descargas, rate limit
                     ├─ R2 privado: ZIP de cada producto (sin acceso público)
                     ├─ PayPal Orders v2 (crear, capturar, releer capturas, webhooks)
                     └─ Resend: mail con los links
```

Flujo de pago: el navegador manda solo slugs → el Worker calcula el total desde el catálogo compilado →
crea la orden en PayPal → el comprador aprueba → el Worker captura y verifica estado, monto, moneda, `custom_id`
y merchant → emite un token por archivo (72 h, 5 descargas, en D1 solo su SHA-256) → muestra los links y los manda
por mail. El webhook de PayPal (firma verificada) es el respaldo si el comprador cierra la pestaña, y revoca los
links ante reembolso o contracargo. Detalle y motivos en `docs/DECISIONS.md`.

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `site/` | Frontend Astro (en PR, rama `claude/site-prototype`) |
| `worker/` | Worker de Cloudflare: API de pagos y entrega, migraciones D1, `wrangler.jsonc` |
| `pipeline/` | Scripts Node del catálogo (Thingiverse, licencias, validación, build) |
| `catalog/products/` | Un YAML por producto. `status: draft \| approved` |
| `data/seed/` | CSV semilla original |
| `docs/` | STATUS, TODO, DECISIONS |

## Requisitos

Node 22.13+ (usa `node:sqlite` en los tests). `npm install` en la raíz instala pipeline y worker.

## Comandos

```bash
npm test                      # tests de pipeline + worker
npm run catalog:validate      # valida todos los YAML (falla si un approved está incompleto)
npm run catalog:build         # genera worker/src/generated/catalog.json con los aprobados
npm run typecheck             # tsc del Worker
```

### Pipeline de catálogo (`pipeline/`)

Necesita un token de app de Thingiverse en `THINGIVERSE_TOKEN` (variable de entorno, nunca en el repo).
Reglas de licencias, exclusiones (llaveros, emblemas, maquetas...) y marcas a revisar en `pipeline/config/rules.yaml`;
modelos de auto, años y términos de búsqueda en `pipeline/config/models.yaml`.

```bash
# Importar el CSV semilla como borradores (con token, verifica autor/licencia/archivos en la API)
THINGIVERSE_TOKEN=... node pipeline/src/cli/import-seed.mjs [--dry-run] [--overwrite]

# Buscar piezas nuevas por modelo; exporta pipeline/out/search-<fecha>.csv y, con --write-drafts, crea borradores
THINGIVERSE_TOKEN=... node pipeline/src/cli/search.mjs --model bmw-e30 --write-drafts --limit 40

# Reverificar licencias de los productos aprobados (exit 1 si algo cambió). --all incluye borradores,
# --update refresca verified_at de los que siguen igual
THINGIVERSE_TOKEN=... node pipeline/src/cli/verify-licenses.mjs --report report.md
```

El pipeline **nunca** pisa un producto `approved` y nunca aprueba nada: eso lo hace Joaquín editando el YAML.
Un producto solo puede aprobarse si tiene título y descripción originales, precio ≥ USD 1 (o `free: true` con
`"0.00"` para la Free Library), licencia permitida verificada con fecha, autor, archivos en R2 y ningún flag abierto.

### Worker (`worker/`)

Puesta en marcha (una sola vez):

```bash
cd worker
npx wrangler d1 create clutch-studio          # copiar el database_id a wrangler.jsonc
npx wrangler r2 bucket create clutch-studio-files   # NO habilitar dominio público ni r2.dev
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ORDER_NOTIFY_TO      # tu mail: recibe los pedidos físicos para comprar en CJ
npx wrangler secret put ADMIN_TOKEN          # 32+ caracteres al azar (openssl rand -hex 32); habilita /api/admin/*
npm run db:migrate:remote
```

En `wrangler.jsonc` completar `PAYPAL_CLIENT_ID`, `PAYPAL_MERCHANT_ID`, `SITE_URL` y `MAIL_FROM` (no son secretos).
En PayPal (developer dashboard) registrar el webhook `https://<dominio>/api/paypal/webhook` con los eventos
`PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED` y `PAYMENT.CAPTURE.DENIED`.
En Resend verificar el dominio (SPF/DKIM) y usar una dirección de ese dominio en `MAIL_FROM`.

Desarrollo local: copiar `worker/.dev.vars.example` a `worker/.dev.vars` con credenciales **sandbox** y correr
`npm run db:migrate:local && npm run dev`.

Subir archivos de producto a R2 (clave `products/<slug>/<archivo>.zip`, la misma que en `files[].r2_key`):

```bash
npx wrangler r2 object put clutch-studio-files/products/<slug>/<slug>.zip --file ./<slug>.zip --remote
```

### API

| Método y ruta | Uso |
| --- | --- |
| `POST /api/orders` `{items:[{slug}]}` | Crea la orden (precio del servidor). Devuelve `{id}` para el JS SDK |
| `POST /api/capture` `{orderID}` | Captura y verifica; devuelve `{status, downloads[]}` |
| `POST /api/resend` `{email}` | Reenvía links nuevos al mail que pagó (respuesta genérica) |
| `POST /api/paypal/webhook` | Webhooks de PayPal con firma verificada |
| `GET /d/<token>` / `POST /d/<token>` | Página de descarga / descarga (consume 1) |
| `GET /api/admin/fulfillments?status=` | Pedidos físicos (Bearer `ADMIN_TOKEN`) |
| `POST /api/admin/fulfillment` | `{order_id, action:'ordered', supplier_order_ref}` o `{order_id, action:'shipped', carrier, tracking_number}` |

### Pedidos físicos (dropshipping manual)

1. Si el carrito tiene físicos, PayPal pide la dirección. `/api/capture` relee la orden y **antes de cobrar** rechaza
   destinos fuera de EE.UU., UE-27 y Australia (o fuera de las rutas del producto). El envío está incluido en el precio.
2. Tras la captura verificada llega un mail a `ORDER_NOTIFY_TO` con el link de CJ, variante, ruta sugerida y dirección;
   el comprador recibe una confirmación sin plazos. Los digitales del mismo carrito se entregan al instante.
3. Comprás en CJ con tarjeta y registrás todo desde la terminal (con `ADMIN_TOKEN` en el entorno, nunca en el repo):

```bash
ADMIN_TOKEN=... npm run fulfillment -- list PENDING
ADMIN_TOKEN=... npm run fulfillment -- ordered <orden> <nro de pedido CJ>
ADMIN_TOKEN=... npm run fulfillment -- shipped <orden> <CARRIER> <tracking>   # carga el tracking en PayPal (notify_buyer) y avisa al comprador
```

Un reembolso o reversión cancela el envío si no se compró; si ya estaba comprado en CJ, llega una alerta.

Los `POST /api/*` exigen `Origin` igual a `SITE_URL` y `Content-Type: application/json`. Hay rate limit por IP
(órdenes y capturas 10/min, descargas 30/min, reenvíos 3/h, admin 30/min).

## Deploy

Secretos (todos en GitHub → Settings → Secrets and variables → Actions, nunca en el repo):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PAYPAL_CLIENT_SECRET`, `THINGIVERSE_TOKEN` y, más adelante,
`PAYPAL_WEBHOOK_ID` y `RESEND_API_KEY`. Workflows manuales (pestaña Actions):
- **Bootstrap Cloudflare**: crea D1 y el bucket R2 privado y aplica migraciones (una vez; se puede re-correr).
- **Verify seed drafts**: verifica los borradores del CSV contra la API de Thingiverse y abre un PR.

El deploy resuelve el `database_id` real en CI (no se commitea) y sincroniza los secretos del Worker con
`wrangler secret bulk` a partir de los secretos de GitHub.

`.github/workflows/deploy.yml` despliega en cada push a `main` cuando la variable del repo `DEPLOY_ENABLED` es
`true` y existen los secrets `CLOUDFLARE_API_TOKEN` (con permisos mínimos: Workers, D1 y R2 de esta cuenta) y
`CLOUDFLARE_ACCOUNT_ID`. `ci.yml` corre tests, validación del catálogo, typecheck y build del sitio en cada PR.
`verify-licenses.yml` reverifica licencias cada lunes (secret `THINGIVERSE_TOKEN`) y abre un issue si algo cambió.

### Pasar PayPal a live

El código no cambia: lo decide la variable de repo `PAYPAL_MODE`.
1. En developer.paypal.com, con la cuenta Business verificada, cambiar a **Live** → Apps & Credentials → crear una app REST.
2. En esa app, agregar el webhook `https://<sitio>/api/paypal/webhook` con `PAYMENT.CAPTURE.COMPLETED`, `REFUNDED`, `REVERSED` y `DENIED`.
3. En GitHub → Settings → Secrets and variables → Actions: secrets `PAYPAL_LIVE_CLIENT_ID`, `PAYPAL_LIVE_CLIENT_SECRET`,
   `PAYPAL_LIVE_WEBHOOK_ID`; variable `PAYPAL_MODE` = `live` (opcional: `PAYPAL_LIVE_MERCHANT_ID`, `MAIL_FROM`).
4. Correr el workflow Deploy (o hacer push a `main`). Si falta algún dato, el deploy falla sin publicar nada.

En live los productos `test: true` no se compilan ni se listan, y `MAIL_SANDBOX_TO` se ignora. Para volver a sandbox, borrar
`PAYPAL_MODE` y redeployar. Los mails a compradores necesitan un dominio verificado en Resend (`MAIL_FROM`): con
`onboarding@resend.dev` solo le llegan al dueño de la cuenta de Resend.

## Seguridad (resumen)

Sin secretos en el repo · precio y entrega decididos en el servidor · firma de webhooks verificada (con allowlist
del host del certificado) y captura releída por API · tokens aleatorios de 256 bits guardados como hash ·
descarga atómica con vencimiento y límite · R2 privado · validación de inputs y límites de tamaño ·
rate limiting · CSP y headers de seguridad en las páginas del Worker.

## TODO

Ver `docs/TODO.md` (por fase).
