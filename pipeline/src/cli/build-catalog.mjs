#!/usr/bin/env node
// Compile APPROVED products into worker/src/generated/catalog.json.
// The Worker prices orders from this file only; drafts never reach it.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadRules, PRODUCTS_DIR, REPO_DIR } from '../config.mjs';
import { readProducts } from '../catalog-io.mjs';
import { validateCatalog } from '../schema.mjs';
import { buildWorkerCatalog } from '../build.mjs';

const rules = await loadRules();
const entries = await readProducts(PRODUCTS_DIR);
const errors = validateCatalog(entries, { allowedLicenses: rules.licenses.allowed });
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error('El catálogo tiene errores: no se genera catalog.json');
  process.exit(1);
}
// CATALOG_INCLUDE_TEST=true only for sandbox deploys: adds test: true products so checkout can be tested.
const includeTest = process.env.CATALOG_INCLUDE_TEST === 'true';
const catalog = buildWorkerCatalog(entries.map((e) => e.product), { includeTest });
const out = path.join(REPO_DIR, 'worker', 'src', 'generated', 'catalog.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`${Object.keys(catalog.products).length} productos${includeTest ? ' (incluye test)' : ' aprobados'} -> ${path.relative(REPO_DIR, out)}`);
