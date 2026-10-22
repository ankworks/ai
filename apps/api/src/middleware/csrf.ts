/**
 * Double-submit CSRF for ConAI-owned routes (`/api/v1/*` and `/api/admin/*`).
 *
 * better-auth endpoints (`/api/auth/*`, `/api/admin-auth/*`) carry their own
 * Origin/Fetch-Metadata CSRF checks (see SECURITY.md §3) — this layer only
 * guards our own routes. Safe methods also mint the `conai_csrf` cookie so the
 * first mutation works.
 */

import { createMiddleware } from 'hono/factory';
import { CSRF_HEADER, checkCsrf, createCsrfCookie, isStateChanging } from '@conai/auth';
import type { AppEnv } from '../env';
import { errorResponse, queueHeader } from './security';

const CSRF_PROTECTED_PREFIXES = ['/api/v1', '/api/admin'];

export const csrfMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  // Exact segment boundary — '/api/admin' must NOT swallow '/api/admin-auth/*'
  // (those are better-auth endpoints with their own CSRF layer).
  const protectedPath = CSRF_PROTECTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (!protectedPath) return next();

  const secure = c.env.ENVIRONMENT === 'production';
  const cookieHeader = c.req.header('cookie') ?? null;

  if (!isStateChanging(c.req.method)) {
    if (!cookieHeader || !cookieHeader.includes('conai_csrf=')) {
      const minted = createCsrfCookie(secure);
      queueHeader(c, 'Set-Cookie', `${minted.name}=${minted.value}; ${minted.attributes}`);
    }
    return next();
  }

  const result = checkCsrf({
    method: c.req.method,
    cookieHeader,
    headerToken: c.req.header(CSRF_HEADER),
  });
  if (!result.ok) {
    return errorResponse(
      'csrf_failed',
      `CSRF check failed (${result.reason})`,
      403,
      c.get('requestId'),
    );
  }
  return next();
});
