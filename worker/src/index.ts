import type { Catalog, Deps, Env } from './env';
import { errorResponse, json } from './http';
import { createOrder } from './handlers/orders';
import { captureOrder } from './handlers/capture';
import { paypalWebhook } from './handlers/webhook';
import { downloadFile, downloadPage } from './handlers/download';
import { resendLinks } from './handlers/resend';
import { listFulfillments, updateFulfillment } from './handlers/admin';
import catalogJson from './generated/catalog.json';

const catalog = catalogJson as Catalog;

export async function route(req: Request, deps: Deps): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  const m = req.method;
  try {
    if (pathname === '/api/orders' && m === 'POST') return await createOrder(req, deps);
    if (pathname === '/api/capture' && m === 'POST') return await captureOrder(req, deps);
    if (pathname === '/api/paypal/webhook' && m === 'POST') return await paypalWebhook(req, deps);
    if (pathname === '/api/resend' && m === 'POST') return await resendLinks(req, deps);
    if (pathname === '/api/admin/fulfillments' && m === 'GET') return await listFulfillments(req, deps);
    if (pathname === '/api/admin/fulfillment' && m === 'POST') return await updateFulfillment(req, deps);
    const d = pathname.match(/^\/d\/([^/]+)\/?$/);
    if (d) {
      if (m === 'GET' || m === 'HEAD') return await downloadPage(d[1]!, deps);
      if (m === 'POST') return await downloadFile(req, d[1]!, deps);
    }
    if (pathname.startsWith('/api/') || d) return json({ error: 'not_found' }, 404);
  } catch (err) {
    return errorResponse(err);
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const deps: Deps = { env, catalog, fetch: (...a) => fetch(...a), now: () => Date.now(), waitUntil: (p) => ctx.waitUntil(p) };
    return (await route(req, deps)) ?? env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
