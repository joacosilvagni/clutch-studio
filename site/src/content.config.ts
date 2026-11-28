// Products come from the shared catalog (../catalog/products/<slug>.yaml), written by the pipeline.
// Strict validation lives in pipeline/src/schema.mjs; this schema is deliberately loose so drafts load.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const str = z.string().nullish();
const num = z.number().nullish();

const products = defineCollection({
  loader: glob({ pattern: '*.yaml', base: '../catalog/products' }),
  schema: z.object({
    slug: z.string(),
    status: z.enum(['draft', 'preview', 'approved']),
    test: z.boolean().default(false),
    free: z.boolean().default(false),
    kind: z.enum(['file', 'pack', 'physical']),
    title: z.string(),
    summary: str,
    description: str,
    category: str,
    part_type: str,
    fits: z
      .array(
        z.object({
          make: z.string(),
          model_slug: z.string(),
          model: str, // display name for cars outside the model list (no /fits/ page)
          years: z.object({ from: z.number(), to: z.number() }),
          note: str, // e.g. "Wagon only", "Driver-side mirror"
          unconfirmed: z.boolean().default(false), // "may also fit": not confirmed by the designer
        }),
      )
      .default([]),
    fitment_note: str,
    price_usd: str,
    oem_part_numbers: z.array(z.coerce.string()).default([]),
    material: z
      .object({ recommended: z.array(z.string()).default([]), avoid: z.array(z.string()).default([]), note: str })
      .nullish(),
    print_settings: z
      .object({ layer_height_mm: num, infill_percent: num, walls: num, supports: str, orientation: str, notes: str })
      .nullish(),
    install_notes: str,
    includes: z.array(z.string()).nullish(),
    sources: z
      .array(
        z.object({
          thing_url: z.string(),
          thing_id: z.coerce.string().nullish(),
          title_original: str,
          author: str,
          author_url: str,
          license: z.string(),
          license_raw: str,
          verified_at: z.coerce.string().nullish(),
        }),
      )
      .default([]),
    artwork: z
      .object({
        source_url: z.string(),
        title: str,
        author: z.string(),
        author_url: str,
        license: z.string(),
        license_label: str,
        verified_at: z.coerce.string().nullish(),
      })
      .nullish(),
    // `files` (R2 keys) is intentionally NOT read: the site never exposes download locations.
    images: z
      .array(z.object({ src: z.string(), alt: z.string().nullish(), kind: z.enum(['photo', 'render']).nullish() }))
      .default([]),
    // Only the destination keys are read (where it ships). Supplier costs never reach the site.
    supplier: z.object({ shipping: z.record(z.string(), z.unknown()).nullish() }).nullish(),
    review: z
      .object({ state: str, flags: z.array(z.string()).default([]), notes: z.array(z.string()).default([]) })
      .nullish(),
  }),
});

export const collections = { products };
