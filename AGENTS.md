# AGENTS.md — reglas para todos los agentes (Claude, Codex y cualquier otro)

Este repo lo trabajan **varios agentes en paralelo** (Claude y Codex) más el dueño, Joaquín.
La coordinación pasa **por este repo**, no por chats. Si algo no está escrito acá, el otro agente no lo sabe.

## Antes de empezar cualquier sesión

1. `git pull` de `main` y leé, en este orden:
   - `docs/STATUS.md` — quién está haciendo qué ahora, último log de cada agente, bloqueos.
   - `docs/TODO.md` — tareas pendientes por fase.
   - `docs/DECISIONS.md` — decisiones ya tomadas (no las re-discutas sin motivo nuevo).
2. **Reclamá la tarea** antes de tocar código: en `docs/STATUS.md` → "En curso", agregá una fila
   `agente | tarea | rama | fecha`. Commit + push de ese cambio solo (`chore(status): claim ...`).
   Si la tarea ya está reclamada por otro agente, elegí otra o dejá una pregunta en "Preguntas abiertas".

## Mientras trabajás

- **Una rama por tarea**: `claude/<tema>`, `codex/<tema>`. Nunca trabajes directo en `main`.
- **PRs chicos** (idealmente < 400 líneas) que toquen una sola área. Mergeá rápido para no divergir.
- **Áreas y dueños por defecto** (se puede cambiar reclamando en STATUS):
  | Área | Carpeta | Dueño por defecto |
  | --- | --- | --- |
  | Frontend Astro | `site/` | Claude (hilo de diseño) |
  | Worker de pagos y entrega | `worker/` | Claude (hilo de backend) |
  | Pipeline de catálogo | `pipeline/` | Claude (hilo de backend) |
  | Productos | `catalog/products/` | Joaquín aprueba; agentes solo crean `status: draft` |
  Si necesitás cambiar algo de un área ajena, abrí PR chico y avisá en STATUS.
- Commits chicos y descriptivos en inglés (`feat(worker): ...`, `fix(pipeline): ...`, `docs: ...`).
- Corré `npm test` antes de abrir el PR. No deshabilites ni borres tests para que pase.

## Reglas no negociables

- **Cero secretos en el repo.** Nada de tokens, API keys, client secrets ni `.dev.vars`.
  Secretos van en `wrangler secret put` (Cloudflare) y en GitHub Actions secrets.
- **Nunca confiar en el cliente**: precios desde el catálogo compilado; entrega solo tras captura verificada en el servidor.
- **R2 siempre privado**; descargas solo vía el Worker con token.
- **Nada se publica sin aprobación de Joaquín**: los agentes no cambian `status` a `approved`.
- **Licencias**: solo CC BY, CC BY-SA y CC0. Se excluye todo NC y ND. Atribución obligatoria.
- **Marcas**: sin logos ni emblemas; solo uso descriptivo ("fits BMW E30 (1982–1994)").
- Sitio 100% en inglés. Documentación interna en español.

## Al terminar la sesión (obligatorio)

Actualizá `docs/STATUS.md`:
1. Sacá tu fila de "En curso" (o dejala con el estado real si queda a medias).
2. Agregá una entrada al **inicio** del "Log de sesiones": fecha, agente, qué hiciste (con links a PR/commits),
   qué quedó pendiente, decisiones tomadas y preguntas abiertas.
3. Tildá/agregá tareas en `docs/TODO.md`. Si tomaste una decisión de arquitectura, sumala a `docs/DECISIONS.md`.

Si no actualizás STATUS, el próximo agente va a repetir o pisar tu trabajo.
