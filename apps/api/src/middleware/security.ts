import { createMiddleware } from 'hono/factory';
import { redact, redactString } from '@conai/shared';
import { allowedOrigins, type AppEnv } from '../env';

/**
 * Security middleware:
 *  - explicit CORS allowlist (credentials only from our apps)
 *  - baseline response headers (SECURITY.md §8)
 *  - per-request id (X-Request-Id) for traceability
 *  - structured logs with secret redaction (SECURITY.md §9)
 *  - strict Origin checks on state-changing requests (CSRF layer completes in Phase 2)
 */

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  origin: string | null;
  ipPrefix: string | null;
}

export function logRequest(log: RequestLog): void {
  // Structured JSON access log for Workers observability — redaction guarantees no
  // secrets ever appear (SECURITY.md §9).
  // eslint-disable-next-line no-console -- deliberate structured access log
  console.log(
    JSON.stringify({ type: 'request', ...redact(log as unknown as Record<string, unknown>) }),
  );
}

export const securityMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const env = c.env;
  const origins = allowedOrigins(env);
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  const origin = c.req.header('origin') ?? null;
  const started = performance.now();

  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) c.header(key, value);
  if (c.req.url.startsWith('https://')) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // CORS: allowlisted origins only, credentials enabled, explicit preflight.
  const originAllowed = origin !== null && origins.includes(origin);
  if (originAllowed && origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, X-CSRF-Token, X-Request-Id, Authorization',
    );
    c.header('Access-Control-Max-Age', '86400');
  }

  // State-changing requests must come from an allowlisted origin (defense in depth;
  // the double-submit CSRF token joins in Phase 2 — SECURITY.md §3).
  if (!SAFE_METHODS.has(c.req.method)) {
    if (origin !== null && !originAllowed) {
      return c.json(
        { error: { code: 'origin_rejected', message: 'Request origin is not allowed' } },
        403,
      );
    }
  }

  if (c.req.method === 'OPTIONS') {
    // c.body (not `new Response`) so previously set CORS/security headers are applied.
    return c.body(null, originAllowed ? 204 : 405);
  }

  await next();

  const durationMs = Math.round(performance.now() - started);
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
  logRequest({
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs,
    origin: origin ? redactString(origin) : null,
    // Coarse prefix only — never log full IPs of end users verbatim where avoidable.
    ipPrefix: ip ? ip.split('.').slice(0, 3).join('.') + '.x' : null,
  });
  // Pass the settled response through (explicit return keeps noImplicitReturns happy).
  return c.res;
});

/** JSON 404/500 shape shared by the API (ApiErrorBody in @conai/shared). */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId?: string,
): Response {
  return Response.json(
    { error: { code, message, ...(requestId ? { requestId } : {}) } },
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
