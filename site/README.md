# Clutch Studio (site)

Static storefront prototype in Astro. Served by Cloudflare Workers Static Assets
(the Worker in `../worker/` points `assets.directory` at `site/dist`).

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
```

## Brand
- **Name:** Clutch Studio (provisional; change it in `src/data/brand.ts`, `public/favicon.svg`, `astro.config.mjs`).
- **Tagline:** "Gear for cars that outlived their parts."
- **Look:** dark garage. Background `#131417`, text `#ece6da`, safety orange `#e2582a`, blueprint blue for
  placeholder renders. Barlow Condensed (display), Barlow (body), JetBrains Mono (specs). Tokens in `src/styles/global.css`.

## Information architecture
Category-first. Most buyers will not find their exact car, so the car is a **secondary filter**, never the main nav.

Two departments:
1. **Car Accessories** (`kind: physical`, dropshipped) — the headline department.
   Categories: interior-comfort, phone-tech, lighting-electrical, detailing-care, garage-tools, exterior-protection.
2. **3D Print Files** (`kind: file | pack`).
   Categories: clips-fasteners, interior-trim, gauge-pods-bezels, knobs-handles-bushings, storage-cupholders,
   exterior-lighting, engine-bay, workshop-tools.

Fitment on every product is one of: universal (physical with no `fits`), specific (has `fits`), or
"check fitment" (file with no confirmed `fits`).

| Route | Page |
|---|---|
| `/` | Home: hero, the two departments, accessory categories, trust, 3D file categories, Free Library |
| `/accessories/`, `/accessories/<category>/` | Accessories department and categories |
| `/3d-files/`, `/3d-files/<category>/` | 3D files department and categories |
| `/shop/` | Everything, with category chips and a "Fits" car filter |
| `/products/<slug>/` | Product page (layout adapts to physical vs file) |
| `/fits/`, `/fits/<model-slug>/` | Secondary index by car: model-specific products + universal ones |
| `/free-library/`, `/how-it-works/`, `/support/`, `/cart/` | Support pages (cart is a placeholder) |
| `/legal/{terms,privacy,refunds,non-affiliation,attributions}/` | Draft legal pages |

## Rules baked in
- Every product is `status: 'draft'` until approved. OEM numbers only when verified.
- No manufacturer logos; names only as "fits X (years)". Footer + model pages carry non-affiliation text.
- **Reviews:** verified buyers only. The component renders an empty "be the first" state; no seeded
  reviews and no `aggregateRating` in JSON-LD until real reviews exist (FTC 16 CFR 465, UK DMCC, EU UCPD).
- Trust signals are only things true at launch. Add "print-tested" per product once it is actually printed.
- Cart sends only slugs + quantities to `/api/orders`; never prices.
- No return/shipping promises for accessories until the supplier terms are known.

## Data
Products are read from the shared catalog `../catalog/products/*.yaml` (one file per product, written by
the pipeline) through an Astro content collection (`src/content.config.ts`, loose schema; the strict
validator is `pipeline/src/schema.mjs`). `src/data/products.ts` maps YAML to the view model.

- Production build lists **only `status: approved`**. Drafts show in `npm run dev`, or in a preview build
  with `PUBLIC_SHOW_DRAFTS=true npm run build`. Never set that flag for the production deploy.
- Products whose fits have no known model slug are skipped (no URL to put them under).
- `files[]` (R2 keys) is never read by the site.
- Makes, models and categories live in `src/data/catalog.ts`; keep the slugs in sync with the schema.
