/**
 * Product schema, shared by the pipeline, the catalog build and (via the build) the Worker.
 * One YAML file per product in catalog/products/<slug>.yaml.
 *
 * Drafts may be incomplete. `status: approved` products must pass every check, because
 * approved products are the only ones the site lists and the Worker sells.
 */
// preview: listed on the site with its cover and 3D view, but never sold (no price/files needed).
export const STATUSES = ['draft', 'preview', 'approved'];
export const KINDS = ['file', 'pack', 'physical'];
export const CATEGORIES = [
  'clips-fasteners',
  'interior-trim',
  'gauge-pods-bezels',
  'knobs-handles-bushings',
  'storage-cupholders',
  'exterior-lighting',
  'engine-bay',
  'workshop-tools',
  // Physical accessories (dropshipping)
  'interior-comfort',
  'phone-tech',
  'lighting-electrical',
  'detailing-care',
  'garage-tools',
  'exterior-protection',
  'wall-art-decor',
];
export const MODEL_SLUGS = [
  'bmw-e30',
  'bmw-e36',
  'mazda-miata',
  'vw-beetle',
  'vw-bus-t2',
  'vw-golf-mk1',
  'vw-golf-mk2',
  'mercedes-w123',
  'volvo-240',
  'jeep-cherokee-xj',
  'land-rover-defender',
  'saab-900',
  'chevrolet-c10',
];

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PRICE_RE = /^\d{1,4}\.\d{2}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// R2 keys we generate: products/<slug>/<file>.zip. No "..", no leading slash.
export const R2_KEY_RE = /^products\/[a-z0-9-]+\/[A-Za-z0-9._-]+$/;
export const MIN_PRICE_CENTS = 100;
// Physical products ship to these destinations only (UK excluded at launch: VAT registration from the first sale).
export const SHIP_TO = ['US', 'EU', 'AU'];
export const SUPPLIERS = ['cj', 'printful'];
// Photos printed on physical products (posters) come from Wikimedia Commons with a free license.
const ARTWORK_URL_RE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:.+/;
const COST_RE = /^\d{1,4}\.\d{2}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function priceToCents(price) {
  if (typeof price !== 'string' || !PRICE_RE.test(price)) return null;
  const [units, cents] = price.split('.');
  return Number(units) * 100 + Number(cents);
}

/**
 * @param {object} p product
 * @param {{allowedLicenses: string[], fileSlug?: string}} opts
 * @returns {string[]} errors (empty = valid)
 */
export function validateProduct(p, { allowedLicenses, fileSlug } = {}) {
  const e = [];
  if (!isObj(p)) return ['el producto no es un objeto'];
  const approved = p.status === 'approved';

  if (!nonEmpty(p.slug) || !SLUG_RE.test(p.slug)) e.push('slug inválido');
  if (fileSlug && p.slug !== fileSlug) e.push(`slug "${p.slug}" no coincide con el nombre de archivo "${fileSlug}"`);
  if (!STATUSES.includes(p.status)) e.push(`status debe ser ${STATUSES.join('|')}`);
  if (!KINDS.includes(p.kind)) e.push(`kind debe ser ${KINDS.join('|')}`);
  if (p.category != null && !CATEGORIES.includes(p.category)) e.push(`category "${p.category}" no existe`);

  if (!Array.isArray(p.fits)) e.push('fits debe ser una lista');
  else
    p.fits.forEach((f, i) => {
      if (!isObj(f)) return e.push(`fits[${i}] inválido`);
      if (!nonEmpty(f.make)) e.push(`fits[${i}].make vacío`);
      if (!nonEmpty(f.model_slug) || !SLUG_RE.test(f.model_slug)) e.push(`fits[${i}].model_slug inválido`);
      const y = f.years;
      if (!isObj(y) || !Number.isInteger(y.from) || !Number.isInteger(y.to) || y.from > y.to)
        e.push(`fits[${i}].years debe ser {from, to} con from <= to`);
    });

  if (p.price_usd != null && priceToCents(p.price_usd) == null) e.push('price_usd debe ser un texto como "9.00"');
  if (p.free != null && typeof p.free !== 'boolean') e.push('free debe ser true o false');
  // test: true = sandbox-only product to exercise checkout end to end. Never approved, never listed in production.
  if (p.test != null && typeof p.test !== 'boolean') e.push('test debe ser true o false');
  if (p.test === true) {
    if (p.status !== 'draft') e.push('un producto test: true no puede estar aprobado ni en vitrina (solo draft)');
    // physical test products exercise the shipping checkout; nothing is ever bought for them.
    if (p.kind !== 'file' && p.kind !== 'physical') e.push('test: true solo aplica a kind: file o physical');
    const tc = priceToCents(p.price_usd);
    if (tc == null || tc < MIN_PRICE_CENTS) e.push(`test: true requiere price_usd >= ${(MIN_PRICE_CENTS / 100).toFixed(2)}`);
    if (p.kind === 'file' && (!Array.isArray(p.files) || p.files.length === 0)) e.push('test: true requiere files');
  }
  if (p.includes != null && (!Array.isArray(p.includes) || !p.includes.every((s) => SLUG_RE.test(s))))
    e.push('includes debe ser una lista de slugs');
  if (p.kind !== 'pack' && Array.isArray(p.includes) && p.includes.length) e.push('includes solo aplica a kind: pack');

  if (!Array.isArray(p.sources)) e.push('sources debe ser una lista');
  else
    p.sources.forEach((s, i) => {
      if (!isObj(s)) return e.push(`sources[${i}] inválido`);
      if (!nonEmpty(s.thing_url) || !/^https:\/\/www\.thingiverse\.com\/thing:\d+$/.test(s.thing_url))
        e.push(`sources[${i}].thing_url inválido`);
      if (!nonEmpty(s.license)) e.push(`sources[${i}].license vacío`);
      if (s.verified_at != null && !DATE_RE.test(String(s.verified_at))) e.push(`sources[${i}].verified_at debe ser YYYY-MM-DD`);
    });

  if (p.files != null) {
    if (!Array.isArray(p.files)) e.push('files debe ser una lista');
    else
      p.files.forEach((f, i) => {
        if (!isObj(f) || !R2_KEY_RE.test(String(f.r2_key ?? ''))) e.push(`files[${i}].r2_key inválido (products/<slug>/<archivo>)`);
      });
  }

  // supplier: where a physical product comes from. Internal only, never shown on the site.
  if (p.supplier != null) {
    const sp = p.supplier;
    if (p.kind !== 'physical') e.push('supplier solo aplica a kind: physical');
    if (!isObj(sp)) e.push('supplier inválido');
    else {
      if (!SUPPLIERS.includes(sp.platform)) e.push(`supplier.platform debe ser ${SUPPLIERS.join('|')}`);
      if (!nonEmpty(sp.product_url) || !/^https:\/\//.test(sp.product_url)) e.push('supplier.product_url inválido');
      if (sp.cost_usd != null && !COST_RE.test(String(sp.cost_usd))) e.push('supplier.cost_usd debe ser un texto como "3.20"');
      if (sp.shipping != null) {
        if (!isObj(sp.shipping)) e.push('supplier.shipping inválido');
        else
          for (const [dest, s] of Object.entries(sp.shipping)) {
            if (!SHIP_TO.includes(dest)) e.push(`supplier.shipping.${dest}: destino no habilitado (${SHIP_TO.join('|')})`);
            if (!isObj(s)) { e.push(`supplier.shipping.${dest} inválido`); continue; }
            if (s.cost_usd != null && !COST_RE.test(String(s.cost_usd))) e.push(`supplier.shipping.${dest}.cost_usd inválido`);
            if (s.days != null && !/^\d{1,2}-\d{1,2}$/.test(String(s.days))) e.push(`supplier.shipping.${dest}.days debe ser "7-12"`);
          }
      }
    }
  }

  // artwork: the photo printed on a physical product (poster). Credit is shown on the site.
  if (p.artwork != null) {
    const a = p.artwork;
    if (p.kind !== 'physical') e.push('artwork solo aplica a kind: physical');
    if (!isObj(a)) e.push('artwork inválido');
    else {
      if (!nonEmpty(a.source_url) || !ARTWORK_URL_RE.test(a.source_url)) e.push('artwork.source_url debe ser https://commons.wikimedia.org/wiki/File:...');
      if (!allowedLicenses?.includes(a.license)) e.push(`artwork.license ${a.license} no permitida`);
      if (!nonEmpty(a.author)) e.push('artwork sin author (atribución obligatoria)');
      if (a.verified_at != null && !DATE_RE.test(String(a.verified_at))) e.push('artwork.verified_at debe ser YYYY-MM-DD');
    }
  }

  if (p.status === 'preview') {
    if (!nonEmpty(p.title)) e.push('preview sin title');
    if (!p.category) e.push('preview sin category');
    if (!Array.isArray(p.sources) || p.sources.length === 0) e.push('preview sin sources (atribución)');
    for (const [i, s] of (p.sources ?? []).entries()) {
      if (!allowedLicenses?.includes(s.license)) e.push(`sources[${i}] licencia ${s.license} no permitida`);
      if (!nonEmpty(s.author)) e.push(`sources[${i}] sin author (atribución obligatoria)`);
    }
  }

  if (approved) {
    if (!nonEmpty(p.title)) e.push('aprobado sin title');
    if (!nonEmpty(p.description)) e.push('aprobado sin description original');
    if (!p.category) e.push('aprobado sin category');
    // fits: [] on a physical product means universal fit.
    if (p.kind !== 'physical' && (!Array.isArray(p.fits) || p.fits.length === 0)) e.push('aprobado sin fits');
    const cents = priceToCents(p.price_usd);
    if (p.free === true) {
      if (cents !== 0) e.push('free: true requiere price_usd "0.00"');
    } else if (cents == null || cents < MIN_PRICE_CENTS) e.push(`aprobado sin price_usd >= ${(MIN_PRICE_CENTS / 100).toFixed(2)}`);
    if (p.kind === 'file') {
      if (!Array.isArray(p.files) || p.files.length === 0) e.push('aprobado sin files en R2');
      if (!Array.isArray(p.sources) || p.sources.length === 0) e.push('aprobado sin sources (atribución)');
    }
    if (p.kind === 'physical') {
      const sp = p.supplier;
      if (!isObj(sp)) e.push('físico aprobado sin supplier');
      else {
        if (sp.cost_usd == null) e.push('físico aprobado sin supplier.cost_usd');
        for (const dest of SHIP_TO)
          if (!isObj(sp.shipping?.[dest]) || sp.shipping[dest].cost_usd == null || sp.shipping[dest].days == null)
            e.push(`físico aprobado sin envío verificado a ${dest} (cost_usd y days)`);
      }
      if (!Array.isArray(p.images) || p.images.length === 0) e.push('físico aprobado sin images');
      if (isObj(p.artwork) && !p.artwork.verified_at) e.push('artwork sin verified_at: verificar la licencia de la foto antes de aprobar');
    }
    if (p.kind === 'pack' && (!Array.isArray(p.includes) || p.includes.length < 2)) e.push('un pack aprobado necesita al menos 2 includes');
    for (const [i, s] of (p.sources ?? []).entries()) {
      if (!allowedLicenses?.includes(s.license)) e.push(`sources[${i}] licencia ${s.license} no permitida`);
      if (!s.verified_at) e.push(`sources[${i}] sin verified_at: verificar la licencia antes de aprobar`);
      if (!nonEmpty(s.author)) e.push(`sources[${i}] sin author (atribución obligatoria)`);
    }
    const openFlags = (p.review?.flags ?? []).filter(Boolean);
    if (openFlags.length) e.push(`aprobado con ${openFlags.length} flag(s) de revisión sin resolver`);
  }
  return e;
}

/** Cross-product checks: unique slugs, pack members exist and are approved. */
export function validateCatalog(entries, opts) {
  const errors = [];
  const bySlug = new Map();
  for (const { file, product } of entries) {
    const fileSlug = file.replace(/\.ya?ml$/, '').split(/[\\/]/).pop();
    for (const err of validateProduct(product, { ...opts, fileSlug })) errors.push(`${file}: ${err}`);
    if (product?.slug) {
      if (bySlug.has(product.slug)) errors.push(`${file}: slug duplicado "${product.slug}"`);
      bySlug.set(product.slug, product);
    }
  }
  for (const { file, product } of entries) {
    if (product?.kind !== 'pack' || product.status !== 'approved') continue;
    for (const s of product.includes ?? []) {
      const member = bySlug.get(s);
      if (!member) errors.push(`${file}: includes "${s}" no existe`);
      else if (member.status !== 'approved') errors.push(`${file}: includes "${s}" no está aprobado`);
    }
  }
  return errors;
}
