// Client-side cart. Stores only what the cart page needs to render; the Worker receives slugs only
// and decides prices itself. Digital files: one of each, so adding twice is a no-op.
export type CartItem = { slug: string; title: string; priceUsd: number };

const KEY = 'cs.cart.v1';
const MAX_ITEMS = 20;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function read(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i) => i && typeof i.slug === 'string' && SLUG_RE.test(i.slug) && typeof i.title === 'string' && Number.isFinite(i.priceUsd))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function write(items: CartItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* private mode or storage blocked: the cart just won't persist */
  }
  window.dispatchEvent(new CustomEvent('cart:change', { detail: { items, count: items.length } }));
}

export function getCart(): CartItem[] {
  return read();
}

export function cartCount(): number {
  return read().length;
}

export function cartTotal(items = read()): number {
  return Math.round(items.reduce((s, i) => s + i.priceUsd, 0) * 100) / 100;
}

/** Returns false when the item was already in the cart or the cart is full. */
export function addToCart(item: CartItem): boolean {
  if (!SLUG_RE.test(item.slug)) return false;
  const items = read();
  if (items.some((i) => i.slug === item.slug) || items.length >= MAX_ITEMS) return false;
  write([...items, { slug: item.slug, title: item.title, priceUsd: item.priceUsd }]);
  return true;
}

export function inCart(slug: string): boolean {
  return read().some((i) => i.slug === slug);
}

export function removeFromCart(slug: string): void {
  write(read().filter((i) => i.slug !== slug));
}

export function clearCart(): void {
  write([]);
}

// Cross-tab sync: another tab changed the cart.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) window.dispatchEvent(new CustomEvent('cart:change', { detail: { items: read(), count: read().length } }));
  });
}
