// Downloads supplier images that are still hotlinked in catalog/products/*.yaml, stores them as
// site/public/media/products/<slug>/<n>.webp and rewrites the YAML to point at the local copy.
// Runs in GitHub Actions (.github/workflows/fetch-images.yml): the dev container cannot reach these CDNs.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../../../', import.meta.url).pathname;
const PRODUCTS = join(ROOT, 'catalog/products');
const OUT = join(ROOT, 'site/public/media/products');
// Only hosts we buy from. Anything else is left untouched and reported.
const HOSTS = new Set(['cf.cjdropshipping.com', 'oss-cf.cjdropshipping.com', 'cc-west-usa.cjdropshipping.com', 'cc-west-usa.oss-accelerate.aliyuncs.com']);
const SRC_RE = /^(\s*-\s*src:\s*)(https:\/\/\S+)\s*$/;

let changed = 0;
let failed = 0;
for (const file of (await readdir(PRODUCTS)).filter((f) => f.endsWith('.yaml')).sort()) {
  const slug = file.replace(/\.yaml$/, '');
  const lines = (await readFile(join(PRODUCTS, file), 'utf8')).split('\n');
  let n = 0;
  let dirty = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SRC_RE);
    if (!m) continue;
    n++;
    const url = new URL(m[2]);
    if (!HOSTS.has(url.hostname)) { console.warn(`${file}: host no permitido ${url.hostname}`); continue; }
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (clutch-studio catalog)' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(join(OUT, slug), { recursive: true });
      const name = `${n}.webp`;
      await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(OUT, slug, name));
      lines[i] = `${m[1]}/media/products/${slug}/${name}`;
      dirty = true;
      console.log(`${file}: ${url.hostname} -> ${name}`);
    } catch (err) {
      failed++;
      console.error(`${file}: no se pudo bajar ${url.href}: ${err.message}`);
    }
  }
  if (dirty) { await writeFile(join(PRODUCTS, file), lines.join('\n')); changed++; }
}
console.log(`${changed} productos actualizados, ${failed} imágenes con error`);
if (failed) process.exitCode = 1;
