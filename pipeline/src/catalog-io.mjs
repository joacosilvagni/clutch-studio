import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const KEY_ORDER = [
  'slug', 'status', 'kind', 'title', 'summary', 'description', 'category', 'part_type', 'fits',
  'price_usd', 'free', 'oem_part_numbers', 'material', 'print_settings', 'install_notes', 'includes',
  'sources', 'files', 'images', 'review', 'created_at', 'updated_at',
];

function ordered(product) {
  const out = {};
  for (const k of KEY_ORDER) if (k in product) out[k] = product[k];
  for (const k of Object.keys(product)) if (!(k in out)) out[k] = product[k];
  return out;
}

export async function readProducts(dir) {
  let names = [];
  try {
    names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n)).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const entries = [];
  for (const name of names) {
    const file = path.join(dir, name);
    // Plain YAML only: the default schema does not construct custom tags or functions.
    entries.push({ file, product: YAML.parse(await readFile(file, 'utf8')) });
  }
  return entries;
}

export function productToYaml(product) {
  return YAML.stringify(ordered(product), { lineWidth: 0 });
}

/**
 * Writes a product file. Never overwrites an approved product, and only overwrites
 * an existing draft when `overwrite` is set.
 * @returns {'written'|'skipped-exists'|'skipped-approved'}
 */
export async function writeProduct(dir, product, { overwrite = false } = {}) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${product.slug}.yaml`);
  let existing = null;
  try {
    existing = YAML.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (existing?.status === 'approved') return 'skipped-approved';
  if (existing && !overwrite) return 'skipped-exists';
  await writeFile(file, productToYaml(product), 'utf8');
  return 'written';
}
