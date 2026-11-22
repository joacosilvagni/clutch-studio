/**
 * License normalization. Unknown strings are never allowed: the default is to reject.
 */
export function normalizeThingiverseLicense(raw, rules) {
  const key = String(raw ?? '').trim();
  const id = rules.licenses.map[key] ?? 'UNKNOWN';
  return { id, raw: key, allowed: rules.licenses.allowed.includes(id) };
}

export function normalizeSeedLicense(raw, rules) {
  const key = String(raw ?? '').trim();
  const id = rules.licenses.seed_map[key] ?? 'UNKNOWN';
  return { id, raw: key, allowed: rules.licenses.allowed.includes(id) };
}

/** Licenses that oblige the derivative we sell to carry the same license. */
export function isShareAlike(id) {
  return /-SA$/.test(id);
}
