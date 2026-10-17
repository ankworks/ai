/**
 * Security middleware: CORS allowlist, security headers, structured access log.
 *
 * Headers are applied AFTER `next()` directly onto the final response so that
 * raw `Response` objects returned by better-auth handlers (which bypass Hono's
 * `c.header()` merging) receive them too. Values are only set when absent —
 * better-auth owns `Cache-Control` on `/api/auth/*`.
 */

import { createMiddleware } from 'hono/factory';
import { redactString } from '@conai/shared';
import { allowedOrigins, type AppEnv, type Env } from '../env';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId?: string,
): Response {
  return Response.json({ error: { code, message, requestId } }, { status });
}

/**
 * Queue a header from an inner middleware/route so the security layer applies it
 * to the FINAL response — including raw `Response` objects (better-auth, errorResponse)
 * that never pass through `c.header()` merging.
 */
export function queueHeader(
  c: {
    set: (k: 'pendingHeaders', v: Record<string, string>) => void;
    get: (k: 'pendingHeaders') => Record<string, string> | undefined;
  },
  name: string,
  value: string,
): void {
  const current = c.get('pendingHeaders') ?? {};
  c.set('pendingHeaders', { ...current, [name]: value });
}

export function isOriginAllowed(env: Env, origin: string | undefined | null): boolean {
  if (!origin) return true; // non-browser or same-origin no-CORS request
  if (origin === 'null') return false;
  return allowedOrigins(env).includes(origin);
}

export const securityMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const env = c.env;
  const incomingId = c.req.header('x-request-id');
  const requestId =
    incomingId && /^[A-Za-z0-9._-]{1,64}$/.test(incomingId)
      ? incomingId
      : crypto.randomUUID().slice(0, 8);
  const origin = c.req.header('origin');
  const started = Date.now();
  c.set('requestId', requestId);
  c.set('pendingHeaders', {});

  const secure = env.ENVIRONMENT === 'production' && c.req.url.startsWith('https:');
  const pending: Record<string, string> = {
    ...SECURITY_HEADERS,
    'X-Request-Id': requestId,
  };
  if (secure) pending['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

  const originAllowed = isOriginAllowed(env, origin);
  if (originAllowed && origin) {
    pending['Access-Control-Allow-Origin'] = origin;
    pending['Access-Control-Allow-Credentials'] = 'true';
    pending['Vary'] = 'Origin';
  }

  const apply = (res: Response): Response => {
    const queued = c.get('pendingHeaders') ?? {};
    for (const [key, value] of Object.entries(queued)) {
      if (!res.headers.has(key)) res.headers.set(key, value);
    }
    for (const [key, value] of Object.entries(pending)) {
      if (!res.headers.has(key)) res.headers.set(key, value);
    }
    return res;
  };

  const method = c.req.method.toUpperCase();
  const corsPreflight = method === 'OPTIONS' && c.req.header('origin');

  if (corsPreflight) {
    const allowedMethods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    const allowedHeaders =
      'Content-Type, Authorization, X-CSRF-Token, X-Captcha-Response, X-Request-Id';
    if (!originAllowed) {
      return apply(errorResponse('origin_not_allowed', 'Origin is not allowed', 403, requestId));
    }
    const res = c.body(null, 204);
    res.headers.set('Access-Control-Allow-Methods', allowedMethods);
    res.headers.set('Access-Control-Allow-Headers', allowedHeaders);
    res.headers.set('Access-Control-Max-Age', '86400');
    return apply(res);
  }

  if (!originAllowed) {
    return apply(errorResponse('origin_not_allowed', 'Origin is not allowed', 403, requestId));
  }

  await next();

  const path = new URL(c.req.url).pathname;
  const response = c.res;
  // eslint-disable-next-line no-console -- intentional structured access log (paths redacted)
  console.log(
    JSON.stringify({
      type: 'request',
      requestId,
      method: c.req.method,
      path: redactString(path),
      status: response.status,
      durationMs: Date.now() - started,
    }),
  );
  apply(response);
  return response;
});
