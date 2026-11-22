export function kebab(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive match. Works for terms with spaces or punctuation like "1:24". */
export function containsTerm(haystack, term) {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term.toLowerCase())}($|[^a-z0-9])`, 'i');
  return re.test(String(haystack).toLowerCase());
}

export function matchedTerms(haystack, terms) {
  return terms.filter((t) => containsTerm(haystack, t));
}
