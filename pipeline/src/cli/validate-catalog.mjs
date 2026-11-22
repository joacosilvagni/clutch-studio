#!/usr/bin/env node
// Validate every product file. Exit 1 on any error (used in CI before deploy).
import { loadRules, PRODUCTS_DIR } from '../config.mjs';
import { readProducts } from '../catalog-io.mjs';
import { validateCatalog } from '../schema.mjs';

const rules = await loadRules();
const entries = await readProducts(PRODUCTS_DIR);
const errors = validateCatalog(entries, { allowedLicenses: rules.licenses.allowed });
const approved = entries.filter((e) => e.product?.status === 'approved').length;
console.log(`${entries.length} productos (${approved} aprobados, ${entries.length - approved} borradores)`);
for (const e of errors) console.error(`✗ ${e}`);
process.exitCode = errors.length ? 1 : 0;
