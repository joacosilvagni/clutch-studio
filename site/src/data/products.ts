import { getCollection } from 'astro:content';
import { models, categories, getCategory, getModel, getMake, type Product, type PreviewModel, type ShipZone } from './catalog';
import mediaJson from './media.json';

// Covers and GLB previews from media_tienda/productos_media.json, keyed by Thingiverse id.
type MediaEntry = { cover: { src: string; width: number; height: number } | null; models: PreviewModel[]; defaultModel: number };
const media = mediaJson as Record<string, MediaEntry>;

// Production lists ONLY approved products. Drafts show in `astro dev`, or in a preview build
// with PUBLIC_SHOW_DRAFTS=true. Never set that flag for the production deploy.
export const SHOW_DRAFTS = import.meta.env.DEV || import.meta.env.PUBLIC_SHOW_DRAFTS === 'true';
// Sandbox preview (PayPal sandbox): also lists test: true products so checkout can be tried end to end.
export const SANDBOX = import.meta.env.PUBLIC_SANDBOX === 'true';

const knownModels = new Set(models.map((m) => m.slug));
const knownCats = new Set(categories.map((c) => c.slug));
const SHIP_ZONES: ShipZone[] = ['US', 'EU', 'AU']; // UK excluded at launch
const LICENSE_LABEL: Record<string, string> = { 'CC-BY': 'CC BY', 'CC-BY-SA': 'CC BY-SA', CC0: 'CC0' };

let cache: Product[] | null = null;

export async function getProducts(): Promise<Product[]> {
  if (cache) return cache;
  const entries = await getCollection('products');
  cache = entries
    .map(({ data: d }): Product => ({
      slug: d.slug,
      title: d.title,
      kind: d.kind,
      models: d.fits.filter((f) => !f.unconfirmed && knownModels.has(f.model_slug)).map((f) => f.model_slug),
      fitYears: Object.fromEntries(d.fits.map((f) => [f.model_slug, [f.years.from, f.years.to]])),
      fitList: d.fits.map((f) => {
        const known = knownModels.has(f.model_slug) ? getModel(f.model_slug) : null;
        return {
          label: known ? `${getMake(known.make).name} ${known.name}` : `${f.make} ${f.model ?? f.model_slug}`,
          years: [f.years.from, f.years.to] as [number, number],
          model: known?.slug ?? null,
          note: f.note ?? null,
          unconfirmed: f.unconfirmed,
        };
      }),
      fitmentNote: d.fitment_note ?? null,
      category: d.category && knownCats.has(d.category) ? d.category : d.kind === 'physical' ? 'interior-comfort' : 'interior-trim',
      department: 'accessories',
      priceUsd: d.price_usd != null ? Number(d.price_usd) : null,
      summary: d.summary ?? null,
      description: d.description ?? null,
      oem: d.oem_part_numbers,
      material: { recommended: d.material?.recommended ?? [], avoid: d.material?.avoid ?? [], note: d.material?.note ?? null },
      print: {
        layer: d.print_settings?.layer_height_mm != null ? `${d.print_settings.layer_height_mm} mm` : null,
        infill: d.print_settings?.infill_percent != null ? `${d.print_settings.infill_percent}%` : null,
        walls: d.print_settings?.walls ?? null,
        supports: d.print_settings?.supports ?? null,
        orientation: d.print_settings?.orientation ?? null,
        notes: d.print_settings?.notes ?? null,
      },
      includes: d.includes ?? [],
      install: (d.install_notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
      sources: d.sources.map((s) => ({
        url: s.thing_url,
        author: s.author ?? null,
        authorUrl: s.author_url ?? null,
        license: s.license,
        licenseLabel: s.license_raw ?? LICENSE_LABEL[s.license] ?? s.license,
        verified: !!s.verified_at,
      })),
      status: d.status,
      test: d.test,
      free: d.free,
      shipTo: d.kind !== 'physical' ? [] : d.test ? SHIP_ZONES : SHIP_ZONES.filter((z) => d.supplier?.shipping?.[z] != null),
      reviewFlags: d.review?.flags ?? [],
      images: d.images.map((i) => ({ src: i.src, alt: i.alt ?? d.title, kind: i.kind ?? 'photo' })),
      thingId: d.sources[0]?.thing_id != null ? String(d.sources[0].thing_id) : null,
      preview3d: null,
    }))
    .map((p) => {
      const m = p.thingId ? media[p.thingId] : undefined;
      return m?.models.length ? { ...p, preview3d: { models: m.models, defaultModel: m.defaultModel } } : p;
    })
    .map((p) => ({ ...p, department: getCategory(p.category).department }))
    .filter((p) => (p.test ? SANDBOX || SHOW_DRAFTS : p.status === 'approved' || p.status === 'preview' || SHOW_DRAFTS))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return cache;
}

export const productUrl = (p: Product) => `/products/${p.slug}/`;
export const productsForDepartment = async (d: string) => (await getProducts()).filter((p) => p.department === d);
export const isUniversal = (p: Product) => p.models.length === 0;
export const productsForModel = async (slug: string) => (await getProducts()).filter((p) => p.models.includes(slug));
export const productsForCategory = async (slug: string) => (await getProducts()).filter((p) => p.category === slug);
export const freeProducts = async () => (await getProducts()).filter((p) => p.priceUsd === 0);
export const findProduct = async (slug: string) => (await getProducts()).find((p) => p.slug === slug);

// Short fitment line for cards and product pages.
export const fitSummaryKind = (p: Product): 'specific' | 'universal' | 'unconfirmed' =>
  p.fitList.some((f) => !f.unconfirmed) ? 'specific' : p.kind === 'physical' ? 'universal' : 'unconfirmed';

// Small variant generated next to each product image (<name>-sm.webp).
export const thumbSrc = (src: string) =>
  src.startsWith('/images/products/') || src.startsWith('/media/portadas/') ? src.replace(/\.webp$/, '-sm.webp') : src;
export const hasImage = (p: Product) => p.images.length > 0;
// Digital products can be bought now; physical ones wait for the dropshipping phase.
export const isDigital = (p: Product) => p.department === '3d-files';
export const isPhysical = (p: Product) => p.kind === 'physical';
// Physical items are sold only once approved (or as sandbox test products) and when they ship somewhere.
export const isBuyable = (p: Product) =>
  !p.free && p.priceUsd != null && p.priceUsd > 0 &&
  (isDigital(p) || (isPhysical(p) && (p.status === 'approved' || p.test) && p.shipTo.length > 0));
/** Products with images first, then priced, then the rest. */
export const showcaseOrder = (a: Product, b: Product) =>
  Number(hasImage(b)) - Number(hasImage(a)) || Number(b.priceUsd != null) - Number(a.priceUsd != null) || a.title.localeCompare(b.title);
