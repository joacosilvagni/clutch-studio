import { matchedTerms } from './text.mjs';

/**
 * Decide whether a Thingiverse thing looks like a functional car part.
 * Returns { excluded, excludeHits, score, preferHits, brandFlags }.
 */
export function classifyThing({ name = '', description = '', tags = [] }, rules) {
  const text = [name, description, ...tags].join(' \n ');
  const titleAndTags = [name, ...tags].join(' \n ');
  const { exclude, prefer, brand_flags: brandTerms } = rules.filters;
  // Exclusions look at title and tags only: descriptions often say "no logo" or mention toys in passing.
  const excludeHits = matchedTerms(titleAndTags, exclude);
  const preferHits = matchedTerms(text, prefer);
  const brandFlags = matchedTerms(text, brandTerms);
  const score = preferHits.length * 10 + (matchedTerms(name, prefer).length > 0 ? 20 : 0);
  return { excluded: excludeHits.length > 0, excludeHits, score, preferHits, brandFlags };
}

const CATEGORY_RULES = [
  ['workshop-tools', ['tool', 'screwdriver', 'wrench', 'jig', 'gauge tool', 'bleeder']],
  ['exterior-lighting', ['light', 'lamp', 'headlight', 'fog light', 'indicator', 'license plate light']],
  ['engine-bay', ['engine', 'radiator', 'filter', 'washer', 'tank', 'intake', 'hood', 'coolant', 'pod filter']],
  ['gauge-pods-bezels', ['gauge', 'bezel', 'pod', 'speedometer', 'gauges']],
  ['storage-cupholders', ['cup holder', 'cupholder', 'cup', 'tray', 'basket', 'cubby', 'ashtray', 'ash tray', 'organizer', 'phone']],
  ['knobs-handles-bushings', ['knob', 'handle', 'bushing', 'shifter', 'shortshifter', 'shift', 'lever', 'bearing', 'latch', 'button', 'strap', 'switch']],
  ['clips-fasteners', ['clip', 'clips', 'screw', 'grommet', 'fastener', 'retainer', 'rivet', 'holder']],
];

export const DEFAULT_CATEGORY = 'interior-trim';

export function guessCategory(title) {
  for (const [category, terms] of CATEGORY_RULES) {
    if (matchedTerms(title, terms).length > 0) return category;
  }
  return DEFAULT_CATEGORY;
}
