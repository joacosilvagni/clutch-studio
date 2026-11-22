# Clutch Studio (site)

Static storefront prototype in Astro. Served by Cloudflare Workers Static Assets
(the Worker in `../worker/` points `assets.directory` at `site/dist`).

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
```

## Brand
- **Name:** Clutch Studio (provisional; change it in `src/data/brand.ts`, `public/favicon.svg`, `astro.config.mjs`). **Tagline:** "Discontinued parts, back in print."
- **Look:** workshop manual / parts catalog. Paper `#f2ede3`, ink `#1d1c1a`, safety orange `#e2582a`,
  blueprint blue for part renders. Barlow Condensed (display), Barlow (body), JetBrains Mono (specs).
- **Signature shape:** the part tag (`.tag`) and the logo badge.

## Site map
| Route | Page |
|---|---|
| `/` | Home: car picker, shop by car, featured packs, how it works, part types, trust, Free Library |
| `/makes/` | All makes → models with years |
| `/<model-slug>/` | SEO model page, e.g. `/bmw-e30/`, filter by part type |
| `/<model-slug>/<product-slug>/` | Product: fits, OEM no., print specs, install, license, reviews |
| `/parts/`, `/parts/<category>/` | Browse by part type |
| `/free-library/` | Free files |
| `/how-it-works/`, `/support/` | Printing guide, no-printer help, part requests |
| `/cart/` | Placeholder (checkout via Worker + PayPal, not built here) |
| `/legal/{terms,privacy,refunds,non-affiliation,attributions}/` | Draft legal pages |
| `/accessories/` | **Reserved** for the dropshipping phase (`kind: 'physical'`). Not built. |

## Taxonomy
Make → Model (with years) → Part category. A product can fit several models; its canonical URL
uses the first one.

Categories: clips-fasteners, interior-trim, gauge-pods-bezels, knobs-handles-bushings,
storage-cupholders, exterior-lighting, engine-bay, workshop-tools.

## Rules baked in
- Every product is `status: 'draft'` until approved. OEM numbers only when verified.
- No manufacturer logos; names only as "fits X (years)". Footer + model pages carry non-affiliation text.
- **Reviews:** verified buyers only. The component renders an empty "be the first" state; no seeded
  reviews and no `aggregateRating` in JSON-LD until real reviews exist (FTC 16 CFR 465, UK DMCC, EU UCPD).
- Trust signals are only things true at launch. Add "print-tested" per product once it is actually printed.
- Cart sends only slugs + quantities to `/api/orders`; never prices.

## Data
Products are read from the shared catalog `../catalog/products/*.yaml` (one file per product, written by
the pipeline) through an Astro content collection (`src/content.config.ts`, loose schema; the strict
validator is `pipeline/src/schema.mjs`). `src/data/products.ts` maps YAML to the view model.

- Production build lists **only `status: approved`**. Drafts show in `npm run dev`, or in a preview build
  with `PUBLIC_SHOW_DRAFTS=true npm run build`. Never set that flag for the production deploy.
- Products whose fits have no known model slug are skipped (no URL to put them under).
- `files[]` (R2 keys) is never read by the site.
- Makes, models and categories live in `src/data/catalog.ts`; keep the slugs in sync with the schema.
