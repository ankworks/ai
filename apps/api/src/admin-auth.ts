/**
 * Admin better-auth instance factory for the API Worker (Phase 6).
 *
 * Mirrors auth.ts but builds the SEPARATE admin instance (conai_admin cookies,
 * /api/admin-auth base path, TOTP plugin, sign-up disabled). Cached per isolate.
 */

import { createConaiAdminAuth, type ConaiAdminAuth } from '@conai/auth';
import { createEmailSender } from '@conai/auth';
import { allowedOrigins, type Env } from './env.ts';

let cache: { key: string; db: D1Database; auth: ConaiAdminAuth } | null = null;

const DEV_FALLBACK_SECRET = 'conai-development-only-secret-0000000000';

function adminCacheKey(env: Env): string {
  return JSON.stringify([
    env.ENVIRONMENT,
    env.ROUTING_MODE,
    env.AUTH_BASE_URL,
    env.COOKIE_DOMAIN,
    env.SESSION_SECRET,
    env.ALLOWED_ORIGINS,
    env.ADMIN_OWNER_EMAILS,
  ]);
}

function resolveSecret(env: Env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.ENVIRONMENT === 'development') {
    console.warn('[admin-auth] SESSION_SECRET missing — using an INSECURE development fallback.');
    return DEV_FALLBACK_SECRET;
  }
  throw new Error('SESSION_SECRET is required outside development');
}

function resolveBaseURL(env: Env): string {
  if (env.AUTH_BASE_URL) return env.AUTH_BASE_URL.replace(/\/$/, '');
  if (env.ENVIRONMENT === 'development') return 'http://localhost:8787';
  throw new Error('AUTH_BASE_URL is required outside development (public origin of this API)');
}

/** Parsed ADMIN_OWNER_EMAILS — lowercase, blanks removed. */
export function ownerEmailList(env: Env): string[] {
  return (env.ADMIN_OWNER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminAuth(env: Env): ConaiAdminAuth {
  if (!env.DB) throw new Error('D1 binding (DB) is required for admin authentication');
  const key = adminCacheKey(env);
  if (cache && cache.key === key && cache.db === env.DB) return cache.auth;

  const auth = createConaiAdminAuth({
    db: env.DB,
    secret: resolveSecret(env),
    baseURL: resolveBaseURL(env),
    trustedOrigins: allowedOrigins(env),
    environment: env.ENVIRONMENT,
    crossSubdomain: env.ROUTING_MODE === 'subdomain',
    cookieDomain: env.COOKIE_DOMAIN,
    email: createEmailSender(env),
    ownerEmails: ownerEmailList(env),
  });
  cache = { key, db: env.DB, auth };
  return auth;
}
