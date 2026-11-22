#!/usr/bin/env node
// Re-check the Thingiverse license of every source in the catalog.
// Exit code 1 when any license changed, disappeared or is no longer allowed, so CI can alert.
//   THINGIVERSE_TOKEN=... node pipeline/src/cli/verify-licenses.mjs [--all] [--update] [--report out.md]
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadRules, PRODUCTS_DIR, today } from '../config.mjs';
import path from 'node:path';
import { readProducts, productToYaml } from '../catalog-io.mjs';
import { createThingiverseClient, ThingiverseError } from '../thingiverse.mjs';
import { normalizeThingiverseLicense } from '../licenses.mjs';

const { values: args } = parseArgs({
  options: {
    all: { type: 'boolean', default: false }, // include drafts
    update: { type: 'boolean', default: false }, // write verified_at for unchanged sources
    report: { type: 'string' },
  },
});

const rules = await loadRules();
const client = createThingiverseClient({
  token: process.env.THINGIVERSE_TOKEN,
  minIntervalMs: rules.thingiverse.min_interval_ms,
  maxRetries: rules.thingiverse.max_retries,
});
const date = today();
const entries = (await readProducts(PRODUCTS_DIR)).filter((e) => args.all || e.product.status === 'approved');
const problems = [];
let checked = 0;

for (const { product } of entries) {
  let dirty = false;
  for (const source of product.sources ?? []) {
    checked++;
    try {
      const thing = await client.getThing(source.thing_id);
      const lic = normalizeThingiverseLicense(thing.license, rules);
      if (lic.id !== source.license) {
        problems.push(`- **${product.slug}** (${product.status}): licencia cambió de ${source.license} a ${lic.id} (“${lic.raw}”) — ${source.thing_url}`);
      } else if (!lic.allowed) {
        problems.push(`- **${product.slug}**: licencia ${lic.id} ya no está permitida — ${source.thing_url}`);
      } else if (args.update) {
        source.verified_at = date;
        dirty = true;
      }
    } catch (err) {
      const gone = err instanceof ThingiverseError && err.status === 404;
      problems.push(`- **${product.slug}**: ${gone ? 'el thing ya no existe' : `error de API (${err.message})`} — ${source.thing_url}`);
    }
  }
  if (dirty) {
    product.updated_at = date;
    // Approved files are protected from pipeline writes; refreshing verified_at is the one exception.
    await writeFile(path.join(PRODUCTS_DIR, `${product.slug}.yaml`), productToYaml(product), 'utf8');
  }
}

const body = `# Reverificación de licencias ${date}\n\n${checked} fuentes revisadas, ${problems.length} problema(s).\n\n${problems.join('\n') || 'Sin cambios.'}\n`;
console.log(body);
if (args.report) await writeFile(args.report, body, 'utf8');
process.exitCode = problems.length ? 1 : 0;
