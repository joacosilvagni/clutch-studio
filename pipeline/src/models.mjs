import { containsTerm } from './text.mjs';

/**
 * Map free text ("BMW E30/E36", "Jeep Cherokee XJ 97-01") to catalog fits.
 * Returns { fits: [{make, model_slug, years}], flags: [] }.
 */
export function matchFits(text, models) {
  const normalized = String(text).replace(/\//g, ' / ');
  const fits = [];
  const flags = [];
  const years = parseYears(text);
  for (const m of models) {
    const hit = m.aliases.some((a) => containsTerm(normalized, a));
    if (!hit) continue;
    const blocked = (m.not_if ?? []).filter((t) => containsTerm(normalized, t));
    if (blocked.length) {
      flags.push(`"${text}" menciona ${blocked.join(', ')}: generación fuera de ${m.slug}, revisar`);
      continue;
    }
    fits.push({
      make: m.make,
      model_slug: m.slug,
      years: { from: years?.from ?? m.years.from, to: years?.to ?? m.years.to },
    });
  }
  if (fits.length === 0) flags.push(`"${text}" no coincide con ningún modelo de config/models.yaml`);
  if (years) flags.push(`años tomados del texto "${text}": confirmar`);
  return { fits, flags };
}

function fullYear(two) {
  const n = Number(two);
  return n >= 30 ? 1900 + n : 2000 + n;
}

/** "97-01" -> 1997-2001, "pre-96" -> null..1995. Returns null when no range is written. */
export function parseYears(text) {
  const s = String(text);
  let m = s.match(/\b((?:19|20)\d{2}|\d{2})\s*[-–]\s*((?:19|20)\d{2}|\d{2})\b/);
  if (m) {
    const from = m[1].length === 2 ? fullYear(m[1]) : Number(m[1]);
    const to = m[2].length === 2 ? fullYear(m[2]) : Number(m[2]);
    if (from <= to) return { from, to };
  }
  m = s.match(/\bpre[-\s]?((?:19|20)\d{2}|\d{2})\b/i);
  if (m) {
    const y = m[1].length === 2 ? fullYear(m[1]) : Number(m[1]);
    return { from: null, to: y - 1 };
  }
  return null;
}
