/**
 * Thingiverse REST client (https://api.thingiverse.com) with a polite rate limit and retries.
 * The token comes from the THINGIVERSE_TOKEN env var and is never logged.
 */
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ThingiverseError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createThingiverseClient({
  token,
  fetchImpl = globalThis.fetch,
  minIntervalMs = 1200,
  maxRetries = 4,
  sleep = realSleep,
  now = () => Date.now(),
  baseUrl = 'https://api.thingiverse.com',
} = {}) {
  if (!token) throw new ThingiverseError('Falta THINGIVERSE_TOKEN (app token de https://www.thingiverse.com/apps/create)');
  let last = 0;

  async function get(pathname, params = {}) {
    const url = new URL(pathname, baseUrl);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
    for (let attempt = 0; ; attempt++) {
      const wait = last + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      const res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new ThingiverseError(`Thingiverse ${res.status} en ${url.pathname}`, res.status);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : minIntervalMs * 2 ** (attempt + 1));
    }
  }

  return {
    async searchThings(term, { page = 1, perPage = 30 } = {}) {
      const data = await get(`/search/${encodeURIComponent(term)}/`, { type: 'things', page, per_page: perPage, sort: 'relevant' });
      return Array.isArray(data) ? data : data?.hits ?? [];
    },
    getThing: (id) => get(`/things/${Number(id)}`),
    getFiles: (id) => get(`/things/${Number(id)}/files`),
    getImages: (id) => get(`/things/${Number(id)}/images`),
  };
}

export function thingIdFromUrl(url) {
  const m = String(url).match(/thingiverse\.com\/thing:(\d+)/);
  return m ? Number(m[1]) : null;
}
