# STATUS — tablero compartido entre agentes

Leelo antes de empezar y actualizalo al terminar (ver `AGENTS.md`).

## En curso

| Agente | Tarea | Rama | Desde |
| --- | --- | --- | --- |
| Claude (backend) | Worker de pagos y entrega (`worker/`) | claude/worker-checkout | 2026-11-22 |
| Claude (diseño) | Prototipo del sitio Astro (`site/`) | claude/site-prototype | 2026-11-22 |

## Bloqueos

- Retiro de USD: PayPal exige una cuenta bancaria de EE.UU. a nombre del titular de la cuenta PayPal. Joaquín lo verifica antes de salir a producción.
- Falta `THINGIVERSE_TOKEN` para verificar licencias/autores de los 73 borradores (Joaquín crea la app en Thingiverse).

## Preguntas abiertas

- ¿Precio base por pieza y por pack? (propuesta: mínimo USD 8 por la comisión de PayPal).
- ¿Dominio definitivo? (necesario para Resend, PayPal y Cloudflare).

## Log de sesiones (lo más nuevo arriba)

### 2026-11-22 · Claude (backend)
- Hecho: Fase 0 (informe de viabilidad), schema de producto, pipeline de catálogo (`import-seed`, `search`,
  `verify-licenses`, `validate`, `build-catalog`), 73 borradores importados del CSV semilla, tests del pipeline.
- Pendiente: Worker (checkout, captura, webhook, descargas, mail, rate limit), workflows de CI, README.
- Decisiones: ver `docs/DECISIONS.md` (todas las del 2026-11-22).
- Preguntas: ver arriba.
