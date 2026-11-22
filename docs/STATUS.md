# STATUS — tablero compartido entre agentes

Leelo antes de empezar y actualizalo al terminar (ver `AGENTS.md`).

## En curso

| Agente | Tarea | Rama | Desde |
| --- | --- | --- | --- |
| Claude (backend) | Worker de pagos y entrega (`worker/`) | claude/worker-checkout | 2026-11-22 |
| Claude (diseño) | Prototipo del sitio Astro (`site/`), PR #1 abierto para revisión | claude/site-prototype | 2026-11-22 |

## Bloqueos

- Retiro de USD: PayPal exige una cuenta bancaria de EE.UU. a nombre del titular de la cuenta PayPal. Joaquín lo verifica antes de salir a producción.
- Falta `THINGIVERSE_TOKEN` para verificar licencias/autores de los 73 borradores (Joaquín crea la app en Thingiverse).

## Preguntas abiertas

- ¿Precio base por pieza y por pack? (propuesta: mínimo USD 8 por la comisión de PayPal).
- ¿Dominio definitivo? (necesario para Resend, PayPal y Cloudflare). Hoy `site/astro.config.mjs` usa example.com.
- ¿Política de devoluciones y plazos de envío de accesorios? Depende del proveedor de dropshipping; el sitio no promete nada hasta tenerla.
- ¿Qué precio tienen los accesorios y cómo se muestra el envío (incluido o calculado en el checkout)?

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

### 2026-11-22 · Claude (backend)
- Hecho: Fase 0 (informe de viabilidad), schema de producto, pipeline de catálogo (`import-seed`, `search`,
  `verify-licenses`, `validate`, `build-catalog`), 73 borradores importados del CSV semilla, tests del pipeline.
- Pendiente: Worker (checkout, captura, webhook, descargas, mail, rate limit), workflows de CI, README.
- Decisiones: ver `docs/DECISIONS.md` (todas las del 2026-11-22).
- Preguntas: ver arriba.
