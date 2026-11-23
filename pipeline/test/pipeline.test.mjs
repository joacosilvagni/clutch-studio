import { describe, it, expect } from 'vitest';
import { loadRules, loadModels } from '../src/config.mjs';
import { normalizeThingiverseLicense, normalizeSeedLicense } from '../src/licenses.mjs';
import { classifyThing, guessCategory } from '../src/filters.mjs';
import { matchFits, parseYears } from '../src/models.mjs';
import { parseCSV, toCSV } from '../src/csv.mjs';
import { cleanPartName, seedRowToDraft, thingToDraft } from '../src/drafts.mjs';
import { validateProduct, validateCatalog, priceToCents } from '../src/schema.mjs';
import { buildWorkerCatalog } from '../src/build.mjs';
import { createThingiverseClient } from '../src/thingiverse.mjs';

const rules = await loadRules();
const models = await loadModels();
const ALLOWED = rules.licenses.allowed;

describe('licenses', () => {
  it('accepts only commercial + derivative licenses', () => {
    expect(normalizeThingiverseLicense('Creative Commons - Attribution', rules)).toMatchObject({ id: 'CC-BY', allowed: true });
    expect(normalizeThingiverseLicense('Creative Commons - Attribution - Share Alike', rules).allowed).toBe(true);
    expect(normalizeThingiverseLicense('Creative Commons - Public Domain Dedication', rules).id).toBe('CC0');
    expect(normalizeThingiverseLicense('Creative Commons - Attribution - Non-Commercial', rules).allowed).toBe(false);
    expect(normalizeThingiverseLicense('Creative Commons - Attribution - No Derivatives', rules).allowed).toBe(false);
    expect(normalizeThingiverseLicense('All Rights Reserved', rules).allowed).toBe(false);
  });
  it('rejects unknown strings by default', () => {
    expect(normalizeThingiverseLicense('Creative Commons - Attribution ', rules).allowed).toBe(true); // trimmed
    expect(normalizeThingiverseLicense('CC BY 4.0 maybe', rules)).toMatchObject({ id: 'UNKNOWN', allowed: false });
    expect(normalizeSeedLicense('CC BY-NC', rules).allowed).toBe(false);
  });
});

describe('filters', () => {
  it('excludes keychains, emblems and scale models by title', () => {
    expect(classifyThing({ name: 'BMW E30 keychain' }, rules).excluded).toBe(true);
    expect(classifyThing({ name: 'W123 hood emblem replica' }, rules).excluded).toBe(true);
    expect(classifyThing({ name: 'Golf MK1 1:24 body' }, rules).excluded).toBe(true);
  });
  it('does not exclude on partial words or description mentions', () => {
    expect(classifyThing({ name: 'Turn signal stalk cap' }, rules).excluded).toBe(false); // "sign" is whole-word only
    expect(classifyThing({ name: 'Dash clip', description: 'no logo, plain part' }, rules).excluded).toBe(false);
  });
  it('scores functional parts and flags brand names', () => {
    const c = classifyThing({ name: 'Inca Ronal wheel center cap insert' }, rules);
    expect(c.score).toBeGreaterThan(0);
    expect(c.brandFlags).toContain('ronal');
  });
  it('guesses the design categories', () => {
    expect(guessCategory('Interior Twist Clips')).toBe('clips-fasteners');
    expect(guessCategory('Gauge Bezel')).toBe('gauge-pods-bezels');
    expect(guessCategory('Cup holder')).toBe('storage-cupholders');
    expect(guessCategory('Radiator bleeder screwdriver')).toBe('workshop-tools');
    expect(guessCategory('Door card')).toBe('interior-trim');
  });
});

describe('models', () => {
  it('maps multi-model text to several fits', () => {
    const { fits } = matchFits('BMW E30/E36', models);
    expect(fits.map((f) => f.model_slug)).toEqual(['bmw-e30', 'bmw-e36']);
  });
  it('parses year ranges from the text', () => {
    expect(parseYears('Jeep Cherokee XJ 97-01')).toEqual({ from: 1997, to: 2001 });
    expect(parseYears('Jeep Cherokee XJ pre-96')).toEqual({ from: null, to: 1995 });
    const { fits } = matchFits('Jeep Cherokee XJ pre-96', models);
    expect(fits[0].years).toEqual({ from: 1984, to: 1995 });
  });
  it('flags later generations and unknown models', () => {
    expect(matchFits('Mazda Miata NC', models).fits).toEqual([]);
    expect(matchFits('VW Golf MK4', models).flags.length).toBeGreaterThan(0);
  });
});

describe('csv', () => {
  it('parses quotes and CRLF', () => {
    const rows = parseCSV('a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });
  it('neutralizes formula injection on export', () => {
    expect(toCSV([{ t: '=HYPERLINK("x")' }], ['t'])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('drafts', () => {
  it('extracts OEM numbers and drops Spanish notes', () => {
    expect(cleanPartName('Interior Twist Clips dash/console OEM 51161932255')).toEqual({ name: 'Interior Twist Clips dash/console', oem: ['51161932255'] });
    expect(cleanPartName('Ash Tray (cenicero)').name).toBe('Ash Tray');
  });
  it('seed rows become unverified drafts', () => {
    const d = seedRowToDraft(
      { modelo: 'BMW E30/E36', pieza: 'Cable Holder OEM 61131267476', licencia: 'CC BY', url: 'https://www.thingiverse.com/thing:4784522' },
      { models, rules, today: '2026-11-22', taken: new Set() },
    );
    expect(d.status).toBe('draft');
    expect(d.sources[0]).toMatchObject({ thing_id: 4784522, license: 'CC-BY', verified_at: null });
    expect(d.fits).toHaveLength(2);
    expect(validateProduct(d, { allowedLicenses: ALLOWED })).toEqual([]);
  });
  it('things from the API carry author, license and only allowed images', () => {
    const thing = { id: 1, name: 'E30 dash clip', license: 'Creative Commons - Attribution', creator: { name: 'maker', public_url: 'https://www.thingiverse.com/maker' }, tags: [] };
    const d = thingToDraft(thing, { files: [{ name: 'clip.stl' }], images: [{ sizes: [{ type: 'display', size: 'large', url: 'https://cdn.thingiverse.com/a.jpg' }] }], model: models[0], models, rules, today: '2026-11-22', taken: new Set() });
    expect(d.sources[0]).toMatchObject({ author: 'maker', verified_at: '2026-11-22', file_names: ['clip.stl'], image_urls: ['https://cdn.thingiverse.com/a.jpg'] });
  });
});

function approvedProduct(over = {}) {
  return {
    slug: 'bmw-e30-dash-clip', status: 'approved', kind: 'file', title: 'Dash clip', description: 'Original text',
    category: 'clips-fasteners', fits: [{ make: 'BMW', model_slug: 'bmw-e30', years: { from: 1982, to: 1994 } }],
    price_usd: '4.00',
    sources: [{ thing_url: 'https://www.thingiverse.com/thing:1', license: 'CC-BY', verified_at: '2026-11-22', author: 'maker' }],
    files: [{ r2_key: 'products/bmw-e30-dash-clip/bmw-e30-dash-clip.zip', name: 'clip.zip' }],
    review: { flags: [] },
    ...over,
  };
}

describe('schema', () => {
  it('accepts a complete approved product', () => {
    expect(validateProduct(approvedProduct(), { allowedLicenses: ALLOWED })).toEqual([]);
  });
  it('blocks approval without verified license, price, files or with open flags', () => {
    const errs = (o) => validateProduct(approvedProduct(o), { allowedLicenses: ALLOWED });
    expect(errs({ sources: [{ thing_url: 'https://www.thingiverse.com/thing:1', license: 'CC-BY-NC', verified_at: null, author: 'x' }] }).join()).toMatch(/no permitida.*sin verified_at/);
    expect(errs({ price_usd: '0.50' }).join()).toMatch(/price_usd/);
    expect(errs({ files: [] }).join()).toMatch(/files/);
    expect(errs({ review: { flags: ['logo?'] } }).join()).toMatch(/flag/);
    expect(errs({ files: [{ r2_key: '../secrets' }] }).join()).toMatch(/r2_key/);
    const supplier = {
      platform: 'cj',
      product_url: 'https://cjdropshipping.com/product/-p-1.html',
      cost_usd: '3.19',
      shipping: { US: { cost_usd: '6.69', days: '7-13' }, EU: { cost_usd: '8.34', days: '12-20' }, AU: { cost_usd: '7.27', days: '5-14' } },
    };
    const physical = { kind: 'physical', fits: [], category: 'phone-tech', files: [], sources: [], images: [{ src: '/x.webp' }], supplier };
    expect(validateProduct(approvedProduct(physical), { allowedLicenses: ALLOWED })).toEqual([]);
    // Approved physical products need a supplier, a quote for every destination and images.
    expect(validateProduct(approvedProduct({ ...physical, supplier: undefined }), { allowedLicenses: ALLOWED })).toContain('físico aprobado sin supplier');
    const noAU = { ...supplier, shipping: { US: supplier.shipping.US, EU: supplier.shipping.EU } };
    expect(validateProduct(approvedProduct({ ...physical, supplier: noAU }), { allowedLicenses: ALLOWED }).join()).toMatch(/envío verificado a AU/);
    expect(validateProduct(approvedProduct({ ...physical, images: [] }), { allowedLicenses: ALLOWED })).toContain('físico aprobado sin images');
    // UK is not a destination at launch; supplier only applies to physical products.
    const uk = { ...supplier, shipping: { ...supplier.shipping, UK: { cost_usd: '7.00', days: '6-10' } } };
    expect(validateProduct(approvedProduct({ ...physical, supplier: uk }), { allowedLicenses: ALLOWED }).join()).toMatch(/UK: destino no habilitado/);
    expect(validateProduct({ ...physical, status: 'draft', kind: 'file' }, { allowedLicenses: ALLOWED })).toContain('supplier solo aplica a kind: physical');
    // Posters: the printed photo needs a Commons source, an allowed license, an author and a verified license to approve.
    const artwork = { source_url: 'https://commons.wikimedia.org/wiki/File:Car.jpg', author: 'Someone', license: 'CC-BY-SA', verified_at: '2026-11-23' };
    const poster = { ...physical, supplier: { ...supplier, platform: 'printful', product_url: 'https://www.printful.com/x' }, artwork };
    expect(validateProduct(approvedProduct(poster), { allowedLicenses: ALLOWED })).toEqual([]);
    expect(validateProduct(approvedProduct({ ...poster, artwork: { ...artwork, verified_at: null } }), { allowedLicenses: ALLOWED }).join()).toMatch(/artwork sin verified_at/);
    expect(validateProduct(approvedProduct({ ...poster, artwork: { ...artwork, license: 'CC-BY-NC' } }), { allowedLicenses: ALLOWED }).join()).toMatch(/artwork.license/);
    expect(validateProduct(approvedProduct({ ...poster, artwork: { ...artwork, source_url: 'https://example.com/a.jpg' } }), { allowedLicenses: ALLOWED }).join()).toMatch(/artwork.source_url/);
    expect(validateProduct(approvedProduct({ ...poster, artwork: { ...artwork, author: '' } }), { allowedLicenses: ALLOWED }).join()).toMatch(/artwork sin author/);
    expect(errs({ fits: [] }).join()).toMatch(/sin fits/);
  });
  it('checks packs and duplicate slugs across the catalog', () => {
    const a = approvedProduct();
    const pack = approvedProduct({ slug: 'e30-pack', kind: 'pack', includes: ['bmw-e30-dash-clip', 'missing'], files: [], sources: [] });
    const errors = validateCatalog([{ file: 'bmw-e30-dash-clip.yaml', product: a }, { file: 'e30-pack.yaml', product: pack }, { file: 'dup.yaml', product: { ...a } }], { allowedLicenses: ALLOWED });
    expect(errors.join('\n')).toMatch(/"missing" no existe/);
    expect(errors.join('\n')).toMatch(/slug duplicado/);
  });
  it('allows free Free Library products at 0.00 only when flagged', () => {
    expect(validateProduct(approvedProduct({ free: true, price_usd: '0.00' }), { allowedLicenses: ALLOWED })).toEqual([]);
    expect(validateProduct(approvedProduct({ price_usd: '0.00' }), { allowedLicenses: ALLOWED }).join()).toMatch(/price_usd/);
    expect(validateProduct(approvedProduct({ free: true, price_usd: '3.00' }), { allowedLicenses: ALLOWED }).join()).toMatch(/0\.00/);
    expect(buildWorkerCatalog([approvedProduct({ free: true, price_usd: '0.00' })]).products).toEqual({});
  });
  it('converts prices without floats', () => {
    expect(priceToCents('19.99')).toBe(1999);
    expect(priceToCents('19.9')).toBeNull();
    expect(priceToCents(19.99)).toBeNull();
  });
});

describe('worker catalog build', () => {
  it('includes only approved products and resolves pack files', () => {
    const a = approvedProduct();
    const b = approvedProduct({ slug: 'bmw-e30-vent', files: [{ r2_key: 'products/bmw-e30-vent/v.zip' }] });
    const draft = approvedProduct({ slug: 'draft-one', status: 'draft' });
    const pack = approvedProduct({ slug: 'e30-pack', kind: 'pack', includes: ['bmw-e30-dash-clip', 'bmw-e30-vent'], price_usd: '7.00' });
    const out = buildWorkerCatalog([a, b, draft, pack]);
    expect(Object.keys(out.products).sort()).toEqual(['bmw-e30-dash-clip', 'bmw-e30-vent', 'e30-pack']);
    expect(out.products['e30-pack']).toMatchObject({ price_cents: 700 });
    expect(out.products['e30-pack'].files.map((f) => f.r2_key)).toEqual(['products/bmw-e30-dash-clip/bmw-e30-dash-clip.zip', 'products/bmw-e30-vent/v.zip']);
  });
});

describe('preview products', () => {
  const preview = (o = {}) =>
    approvedProduct({ status: 'preview', price_usd: null, files: [], description: null, sources: [{ ...approvedProduct().sources[0], verified_at: null }], ...o });
  it('need title, category, an allowed license and an author, but no price or files', () => {
    const errs = (o) => validateProduct(preview(o), { allowedLicenses: ALLOWED }).join();
    expect(errs()).toBe('');
    expect(errs({ sources: [{ ...approvedProduct().sources[0], author: null }] })).toMatch(/sin author/);
    expect(errs({ sources: [{ ...approvedProduct().sources[0], license: 'CC-BY-NC' }] })).toMatch(/no permitida/);
  });
  it('are never sold by the Worker', () => {
    expect(buildWorkerCatalog([preview({ price_usd: '9.00', files: [{ r2_key: 'products/x/x.zip' }] })]).products).toEqual({});
  });
});

describe('sandbox test products', () => {
  const testProduct = (o = {}) => approvedProduct({ slug: 'sandbox-test', status: 'draft', test: true, price_usd: '1.00', files: [{ r2_key: 'products/sandbox-test/t.zip' }], ...o });
  it('can never be approved and must be a priced file', () => {
    const errs = (o) => validateProduct(testProduct(o), { allowedLicenses: ALLOWED }).join();
    expect(errs()).toBe('');
    expect(errs({ status: 'approved' })).toMatch(/no puede estar aprobado/);
    expect(errs({ kind: 'pack' })).toMatch(/solo aplica a kind: file/);
    expect(errs({ price_usd: null })).toMatch(/requiere price_usd/);
    expect(errs({ files: [] })).toMatch(/requiere files/);
  });
  it('reaches the Worker catalog only when includeTest is set', () => {
    expect(buildWorkerCatalog([testProduct()]).products).toEqual({});
    expect(buildWorkerCatalog([testProduct(), approvedProduct({ slug: 'some-draft', status: 'draft' })], { includeTest: true }).products).toEqual({
      'sandbox-test': { slug: 'sandbox-test', title: expect.any(String), price_cents: 100, files: [{ r2_key: 'products/sandbox-test/t.zip', name: 't.zip' }] },
    });
  });
});

describe('thingiverse client', () => {
  it('sends the bearer token, spaces calls and retries 429', async () => {
    const calls = [];
    const sleeps = [];
    let t = 0;
    const responses = [new Response('', { status: 429, headers: { 'retry-after': '2' } }), Response.json({ id: 5, license: 'x' })];
    const client = createThingiverseClient({
      token: 'tok',
      minIntervalMs: 1000,
      now: () => t,
      sleep: async (ms) => { sleeps.push(ms); t += ms; },
      fetchImpl: async (url, init) => { calls.push({ url: String(url), auth: init.headers.Authorization }); return responses.shift(); },
    });
    expect(await client.getThing(5)).toMatchObject({ id: 5 });
    expect(calls[0]).toEqual({ url: 'https://api.thingiverse.com/things/5', auth: 'Bearer tok' });
    expect(sleeps).toContain(2000);
  });
  it('refuses to run without a token', () => {
    expect(() => createThingiverseClient({})).toThrow(/THINGIVERSE_TOKEN/);
  });
});
