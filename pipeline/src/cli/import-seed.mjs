#!/usr/bin/env node
// Seed CSV -> draft products in catalog/products/. With THINGIVERSE_TOKEN set, each row is
// checked against the API: license, author, files and images are taken from Thingiverse.
//   node pipeline/src/cli/import-seed.mjs [--csv data/seed/x.csv] [--overwrite] [--dry-run]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadModels, loadRules, PRODUCTS_DIR, REPO_DIR, today } from '../config.mjs';
import { parseCSV } from '../csv.mjs';
import { seedRowToDraft, thingToSource, imageUrls } from '../drafts.mjs';
import { readProducts, writeProduct } from '../catalog-io.mjs';
import { createThingiverseClient } from '../thingiverse.mjs';

const { values: args } = parseArgs({
  options: {
    csv: { type: 'string', default: path.join(REPO_DIR, 'data/seed/catalogo_inicial_thingiverse.csv') },
    overwrite: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const [rules, models] = await Promise.all([loadRules(), loadModels()]);
const rows = parseCSV(await readFile(args.csv, 'utf8'));
const date = today();
const existing = await readProducts(PRODUCTS_DIR);
const taken = new Set(args.overwrite ? [] : existing.map((e) => e.product.slug));
const client = process.env.THINGIVERSE_TOKEN
  ? createThingiverseClient({
      token: process.env.THINGIVERSE_TOKEN,
      minIntervalMs: rules.thingiverse.min_interval_ms,
      maxRetries: rules.thingiverse.max_retries,
    })
  : null;
if (!client) console.warn('Sin THINGIVERSE_TOKEN: los borradores quedan sin verificar (verified_at vacío).');

// Skip rows whose thing is already in the catalog, so re-running is safe.
const knownThings = new Set(existing.flatMap((e) => (e.product.sources ?? []).map((s) => s.thing_id)));
const counts = { written: 0, 'skipped-exists': 0, 'skipped-approved': 0, 'skipped-known-thing': 0 };

for (const row of rows) {
  const draft = seedRowToDraft(row, { models, rules, today: date, taken });
  const src = draft.sources[0];
  if (!args.overwrite && knownThings.has(src.thing_id)) {
    counts['skipped-known-thing']++;
    continue;
  }
  if (client && src.thing_id) {
    try {
      const [thing, files, images] = await Promise.all([
        client.getThing(src.thing_id),
        client.getFiles(src.thing_id),
        client.getImages(src.thing_id),
      ]);
      const verified = thingToSource(thing, rules, date, { images: imageUrls(images) });
      verified.file_names = (files ?? []).map((f) => f.name).filter(Boolean);
      if (verified.license !== src.license) {
        draft.review.flags.push(`la licencia en Thingiverse (${verified.license_raw}) no coincide con el CSV (${src.license_raw})`);
      }
      if (!rules.licenses.allowed.includes(verified.license)) draft.review.flags.push(`licencia ${verified.license} no permitida`);
      draft.sources[0] = verified;
      draft.review.notes = draft.review.notes.filter((n) => !n.startsWith('Verificar licencia'));
    } catch (err) {
      draft.review.flags.push(`no se pudo verificar en la API: ${err.message}`);
    }
  }
  const result = args['dry-run'] ? 'written' : await writeProduct(PRODUCTS_DIR, draft, { overwrite: args.overwrite });
  counts[result]++;
  console.log(`${result.padEnd(16)} ${draft.slug}${draft.review.flags.length ? `  (${draft.review.flags.length} flag)` : ''}`);
}
console.log(JSON.stringify(counts));
