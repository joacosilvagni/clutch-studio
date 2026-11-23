// Client-side cart: an array of product slugs in localStorage['cs-cart'] (the header badge reads it too).
// Only slugs ever leave the browser; the Worker prices every order from its own catalog.
// Digital files: one of each, so adding twice is a no-op.
const KEY = 'cs-cart';
const MAX_ITEMS = 20;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    const arr: unknown[] = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [];
    const slugs = arr.map((x) => (typeof x === 'string' ? x : (x as any)?.slug)).filter((s): s is string => typeof s === 'string' && SLUG_RE.test(s));
    return [...new Set(slugs)].slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function write(slugs: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(slugs));
  } catch {
    /* storage blocked: the cart just won't persist */
  }
  window.dispatchEvent(new CustomEvent('cart:change', { detail: { items: slugs, count: slugs.length } }));
}

export const getCart = (): string[] => read();
export const inCart = (slug: string): boolean => read().includes(slug);
export const clearCart = (): void => write([]);
export const removeFromCart = (slug: string): void => write(read().filter((s) => s !== slug));

/** Returns false when the slug is invalid, already in the cart, or the cart is full. */
export function addToCart(slug: string): boolean {
  const items = read();
  if (!SLUG_RE.test(slug) || items.includes(slug) || items.length >= MAX_ITEMS) return false;
  write([...items, slug]);
  return true;
}

/** Binds [data-add-to-cart] and [data-buy-now] buttons anywhere on the page (event delegation). */
export function bindCartButtons(): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>('[data-add-to-cart], [data-buy-now]');
    const slug = btn?.dataset.slug;
    if (!btn || !slug) return;
    const added = addToCart(slug);
    if (btn.hasAttribute('data-buy-now')) {
      location.assign('/cart/');
      return;
    }
    const msg = btn.closest('[data-buy-box]')?.querySelector<HTMLElement>('[data-cart-msg]');
    if (msg) msg.innerHTML = `${added ? 'Added to cart.' : 'Already in your cart.'} <a href="/cart/">Checkout →</a>`;
  });
}
