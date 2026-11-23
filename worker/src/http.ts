const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra },
  });
}

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...SECURITY_HEADERS,
    },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
  console.error('unhandled', err instanceof Error ? err.stack : err);
  return json({ error: 'internal_error' }, 500);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Reads a JSON body with a hard size cap and content-type check. */
export async function readJson(req: Request, maxBytes = 8 * 1024): Promise<unknown> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type');
  const text = await readText(req, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export async function readText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, 'payload_too_large');
  return new TextDecoder().decode(buf);
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}

/**
 * Browser POSTs to the API must come from our own site. Blocks cross-site form posts and
 * other origins calling the API from a victim's browser.
 */
export function assertSameOrigin(req: Request, siteUrl: string): void {
  const origin = req.headers.get('origin');
  if (origin !== new URL(siteUrl).origin) throw new HttpError(403, 'forbidden_origin');
}
