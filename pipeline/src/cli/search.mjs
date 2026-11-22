#!/usr/bin/env node
// Search Thingiverse per car model, keep only commercially licensed functional parts,
// export a CSV and (optionally) write draft products.
//   THINGIVERSE_TOKEN=... node pipeline/src/cli/search.mjs [--model bmw-e30] [--write-drafts] [--limit 50]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadModels, loadRules, OUT_DIR, PRODUCTS_DIR, today } from '../config.mjs';
import { createThingiverseClient } from '../thingiverse.mjs';
import { normalizeThingiverseLicense } from '../licenses.mjs';
import { classifyThing } from '../filters.mjs';
import { thingToDraft } from '../drafts.mjs';
import { readProducts, writeProduct } from '../catalog-io.mjs';
import { toCSV } from '../csv.mjs';

const { values: args } = parseArgs({
  options: {
    model: { type: 'string', multiple: true },
    'write-drafts': { type: 'boolean', default: false },
    limit: { type: 'string', default: '40' },
  },
});

const [rules, allModels] = await Promise.all([loadRules(), loadModels()]);
const models = args.model ? allModels.filter((m) => args.model.includes(m.slug)) : allModels;
if (!models.length) throw new Error(`Modelo desconocido: ${args.model}`);
const client = createThingiverseClient({
  token: process.env.THINGIVERSE_TOKEN,
  minIntervalMs: rules.thingiverse.min_interval_ms,
  maxRetries: rules.thingiverse.max_retries,
});
const date = today();
const existing = await readProducts(PRODUCTS_DIR);
const knownThings = new Set(existing.flatMap((e) => (e.product.sources ?? []).map((s) => s.thing_id)));
const taken = new Set(existing.map((e) => e.product.slug));
const limit = Number(args.limit);
const report = [];

for (const model of models) {
  const seen = new Map();
  for (const term of model.search) {
    for (let page = 1; page <= rules.thingiverse.max_pages_per_term; page++) {
      const hits = await client.searchThings(term, { page, perPage: rules.thingiverse.per_page });
      for (const h of hits) if (h?.id && !seen.has(h.id)) seen.set(h.id, h);
      if (hits.length < rules.thingiverse.per_page) break;
    }
  }
  // Cheap pre-filter on the search hit (title) before spending API calls on details.
  const candidates = [...seen.values()]
    .map((h) => ({ hit: h, cls: classifyThing({ name: h.name }, rules) }))
    .filter((c) => !c.cls.excluded)
    .sort((a, b) => b.cls.score - a.cls.score)
    .slice(0, limit);

  let kept = 0;
  for (const { hit } of candidates) {
    const thing = await client.getThing(hit.id);
    const lic = normalizeThingiverseLicense(thing.license, rules);
    const tags = (thing.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name));
    const cls = classifyThing({ name: thing.name, description: thing.description, tags }, rules);
    const row = {
      model: model.slug,
      thing_id: thing.id,
      title: thing.name,
      author: thing.creator?.name,
      license: lic.id,
      license_raw: lic.raw,
      score: cls.score,
      decision: !lic.allowed ? 'rechazado-licencia' : cls.excluded ? 'rechazado-filtro' : knownThings.has(thing.id) ? 'ya-en-catalogo' : 'candidato',
      reasons: [...cls.excludeHits, ...cls.brandFlags.map((b) => `marca:${b}`)],
      url: `https://www.thingiverse.com/thing:${thing.id}`,
      verified_at: date,
    };
    report.push(row);
    if (row.decision !== 'candidato' || !args['write-drafts']) continue;
    const [files, images] = await Promise.all([client.getFiles(thing.id), client.getImages(thing.id)]);
    const draft = thingToDraft(thing, { files, images, model, models: allModels, rules, today: date, taken });
    const result = await writeProduct(PRODUCTS_DIR, draft);
    knownThings.add(thing.id);
    kept++;
    console.log(`${result.padEnd(16)} ${draft.slug}`);
  }
  console.log(`${model.slug}: ${seen.size} resultados, ${candidates.length} revisados, ${kept} borradores nuevos`);
}

await mkdir(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `search-${date}.csv`);
await writeFile(out, toCSV(report, ['model', 'thing_id', 'title', 'author', 'license', 'license_raw', 'score', 'decision', 'reasons', 'url', 'verified_at']));
console.log(`CSV: ${out}`);
