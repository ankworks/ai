/**
 * Path-mode static asset serving (Workers Static Assets).
 *
 * Wrangler is configured with `assets.run_worker_first: true` and an `ASSETS`
 * binding, so every request reaches Hono. API routes are registered before
 * this catch-all; anything left is an asset request:
 *
 *   1. Try the exact path against the ASSETS binding (hashed JS/CSS/fonts,
 *      `/`, `/app/`, … — html_handling resolves directory indexes).
 *   2. On 404, fall back to the index.html of the SPA that owns the URL
 *      prefix, so client-side routes survive deep links and full reloads.
 *   3. Unknown `/api/*` paths keep their JSON 404 instead of an HTML page.
 *
 * The assembled asset tree is produced by scripts/assemble-assets.mjs.
 */

import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { errorResponse } from './security';

/** URL prefixes hosting a dedicated SPA (the root SPA is apps/web). */
const SPA_PREFIXES = ['/app', '/account', '/admin', '/status'] as const;

function jsonNotFound(c: Context<AppEnv>): Response {
  const { pathname } = new URL(c.req.url);
  return errorResponse(
    'not_found',
    `No route for ${c.req.method} ${pathname}`,
    404,
    c.get('requestId'),
  );
}

/** Browser navigations request HTML; sub-resource requests (JS/CSS/…) never do. */
function isHtmlNavigation(req: Request): boolean {
  return (req.headers.get('accept') ?? '').includes('text/html');
}

/** GET/HEAD catch-all: static files plus SPA index.html fallback. */
export async function serveStaticAssets(c: Context<AppEnv>): Promise<Response> {
  const { pathname } = new URL(c.req.url);

  // The API surface always answers JSON (this also covers routes Hono would
  // otherwise route to its notFound handler, which is shadowed here).
  if (pathname.startsWith('/api/')) {
    return jsonNotFound(c);
  }

  const assets = c.env.ASSETS;
  if (!assets) {
    // Unit tests and local scaffolds run without an assembled asset tree.
    return jsonNotFound(c);
  }

  const exact = await assets.fetch(c.req.raw);
  if (exact.status !== 404) {
    return exact;
  }

  // A missing hashed JS/CSS/file must surface as a real 404 — never as HTML,
  // which browsers reject with an opaque MIME error and a blank page.
  if (!isHtmlNavigation(c.req.raw)) {
    return exact;
  }

  // Deep link / full reload inside a mounted SPA → serve that SPA's directory
  // index. Fetch the directory URL (e.g. `/app/`), not `/app/index.html`: with
  // html_handling=auto-trailing-slash the latter answers with a 307 redirect.
  const prefix = SPA_PREFIXES.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const indexUrl = prefix ? `${prefix}/` : '/';
  const fallback = await assets.fetch(
    new Request(new URL(indexUrl, c.req.url).toString(), c.req.raw),
  );
  return fallback.ok ? fallback : exact;
}

/** Catch-all for every other method on non-API paths — assets are read-only. */
export function rejectNonAssetMethod(c: Context<AppEnv>): Response {
  return jsonNotFound(c);
}
