import { normalizeSeedLicense, normalizeThingiverseLicense, isShareAlike } from './licenses.mjs';
import { classifyThing, guessCategory } from './filters.mjs';
import { matchFits } from './models.mjs';
import { kebab } from './text.mjs';
import { thingIdFromUrl } from './thingiverse.mjs';

const OEM_RE = /\b(?:\d{11}|\d{9}[A-Z]{0,3})\b/g;

const DEFAULT_MATERIAL = {
  recommended: ['PETG', 'ASA'],
  avoid: ['PLA'],
  note: 'A parked car interior gets hot enough to warp PLA. Use PETG, or ASA for parts in direct sun.',
};

const EMPTY_PRINT_SETTINGS = {
  layer_height_mm: null,
  infill_percent: null,
  walls: null,
  supports: null,
  orientation: null,
  notes: null,
};

/** "Interior Twist Clips dash/console OEM 51161932255" -> { name, oem: ["51161932255"] } */
export function cleanPartName(raw) {
  const oem = [...String(raw).matchAll(OEM_RE)].map((m) => m[0]);
  const name = String(raw)
    .replace(/\([^)]*\)/g, ' ') // drop Spanish notes in parentheses
    .replace(OEM_RE, ' ')
    .replace(/\bOEM\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, oem };
}

export function uniqueSlug(base, taken) {
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

function baseDraft({ slug, title, partName, fits, oem, category, today }) {
  return {
    slug,
    status: 'draft',
    kind: 'file',
    title,
    summary: null,
    description: null,
    category,
    part_type: partName.toLowerCase(),
    fits,
    price_usd: null,
    oem_part_numbers: oem,
    material: { ...DEFAULT_MATERIAL },
    print_settings: { ...EMPTY_PRINT_SETTINGS },
    install_notes: null,
    sources: [],
    files: [],
    images: [],
    review: { state: 'pendiente de revisión manual', flags: [], notes: [] },
    created_at: today,
    updated_at: today,
  };
}

function draftTitle(partName, fits, models) {
  const m = fits[0] && models.find((x) => x.slug === fits[0].model_slug);
  return m ? `${partName} for ${m.make} ${m.model}` : partName;
}

/** Thingiverse thing -> source entry (attribution + license evidence). */
export function thingToSource(thing, rules, today, { images = [] } = {}) {
  const lic = normalizeThingiverseLicense(thing.license, rules);
  return {
    platform: 'thingiverse',
    thing_id: thing.id,
    thing_url: `https://www.thingiverse.com/thing:${thing.id}`,
    title_original: thing.name ?? null,
    author: thing.creator?.name ?? null,
    author_url: thing.creator?.public_url ?? null,
    license: lic.id,
    license_raw: lic.raw,
    verified_at: today,
    // Author images are reused only when the license allows it (all accepted licenses do, with credit).
    images_allowed: lic.allowed,
    file_names: [],
    image_urls: lic.allowed ? images : [],
  };
}

/** One row of data/seed/catalogo_inicial_thingiverse.csv -> draft product. */
export function seedRowToDraft(row, { models, rules, today, taken }) {
  const { name: partName, oem } = cleanPartName(row.pieza);
  const { fits, flags } = matchFits(row.modelo, models);
  const lic = normalizeSeedLicense(row.licencia, rules);
  const thingId = thingIdFromUrl(row.url);
  const prefix = fits[0]?.model_slug ?? kebab(row.modelo);
  const slug = uniqueSlug(`${prefix}-${kebab(partName)}`, taken);
  const category = guessCategory(partName);
  const draft = baseDraft({ slug, title: draftTitle(partName, fits, models), partName, fits, oem, category, today });
  draft.sources.push({
    platform: 'thingiverse',
    thing_id: thingId,
    thing_url: `https://www.thingiverse.com/thing:${thingId}`,
    title_original: row.pieza,
    author: null,
    author_url: null,
    license: lic.id,
    license_raw: lic.raw,
    // The CSV is a claim, not evidence: verified_at stays empty until the API confirms it.
    verified_at: null,
    images_allowed: false,
    file_names: [],
    image_urls: [],
  });
  const review = draft.review;
  review.flags.push(...flags);
  if (!lic.allowed) review.flags.push(`licencia "${row.licencia}" no permitida`);
  if (!thingId) review.flags.push(`url "${row.url}" no es un thing de Thingiverse`);
  const cls = classifyThing({ name: row.pieza }, rules);
  if (cls.excluded) review.flags.push(`coincide con exclusiones: ${cls.excludeHits.join(', ')}`);
  if (cls.brandFlags.length) review.flags.push(`nombra marcas de terceros: ${cls.brandFlags.join(', ')}; verificar que no haya logos`);
  review.notes.push('Escribir title, summary y description originales en inglés (no copiar al autor).');
  review.notes.push('Verificar licencia, autor y archivos con la API (import-seed con THINGIVERSE_TOKEN).');
  if (isShareAlike(lic.id)) review.notes.push('CC BY-SA: el archivo adaptado que se vende debe publicarse bajo CC BY-SA.');
  return draft;
}

/** Thing found by the search pipeline -> draft product. */
export function thingToDraft(thing, { files = [], images = [], model, models, rules, today, taken }) {
  const { name: partName, oem } = cleanPartName(thing.name ?? `thing ${thing.id}`);
  const tags = (thing.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name));
  const { fits, flags } = matchFits(`${thing.name ?? ''} ${model?.search?.[0] ?? ''}`, models);
  const finalFits = fits.length ? fits : model ? [{ make: model.make, model_slug: model.slug, years: { ...model.years } }] : [];
  const slug = uniqueSlug(`${finalFits[0]?.model_slug ?? 'misc'}-${kebab(partName)}`, taken);
  const draft = baseDraft({
    slug,
    title: draftTitle(partName, finalFits, models),
    partName,
    fits: finalFits,
    oem,
    category: guessCategory(`${partName} ${tags.join(' ')}`),
    today,
  });
  const source = thingToSource(thing, rules, today, { images: imageUrls(images) });
  source.file_names = files.map((f) => f.name).filter(Boolean);
  draft.sources.push(source);
  const cls = classifyThing({ name: thing.name, description: thing.description, tags }, rules);
  const review = draft.review;
  if (!fits.length) review.flags.push(...flags);
  if (cls.brandFlags.length) review.flags.push(`nombra marcas de terceros: ${cls.brandFlags.join(', ')}; verificar que no haya logos`);
  review.notes.push(`Score funcional ${cls.score} (${cls.preferHits.join(', ') || 'sin palabras clave'}).`);
  review.notes.push('Escribir title, summary y description originales en inglés (no copiar al autor).');
  if (isShareAlike(source.license)) review.notes.push('CC BY-SA: el archivo adaptado que se vende debe publicarse bajo CC BY-SA.');
  return draft;
}

export function imageUrls(images) {
  return (images ?? [])
    .map((img) => {
      const sizes = img.sizes ?? [];
      const pick = sizes.find((s) => s.type === 'display' && s.size === 'large') ?? sizes.find((s) => s.type === 'display') ?? sizes[0];
      return pick?.url ?? img.url ?? null;
    })
    .filter((u) => typeof u === 'string' && u.startsWith('https://'));
}
