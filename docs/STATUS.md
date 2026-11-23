# STATUS — tablero compartido entre agentes

Leelo antes de empezar y actualizalo al terminar (ver `AGENTS.md`).

## En curso

| Agente | Tarea | Rama | Desde |
| --- | --- | --- | --- |
| Claude (diseño) | Prototipo del sitio Astro (`site/`), PR #1 abierto para revisión | claude/site-prototype | 2026-11-22 |

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
