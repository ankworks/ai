/**
 * better-auth instance factory for the API Worker.
 *
 * The instance is cached per-isolate and rebuilt when any auth-relevant env var
 * changes (wrangler dev hot-reloads trigger a full reload anyway, but tests may
 * swap bindings between requests).
 */

import {
  configuredSocialProviders,
  createConaiAuth,
  createEmailSender,
  type ConaiAuth,
} from '@conai/auth';
import { allowedOrigins, type Env } from './env.ts';

let cache: { key: string; db: D1Database; auth: ConaiAuth } | null = null;

const DEV_FALLBACK_SECRET = 'conai-development-only-secret-0000000000';

function authCacheKey(env: Env): string {
  return JSON.stringify([
    env.ENVIRONMENT,
    env.ROUTING_MODE,
    env.AUTH_BASE_URL,
    env.COOKIE_DOMAIN,
    env.SESSION_SECRET,
    env.ALLOWED_ORIGINS,
    env.TURNSTILE_SECRET_KEY,
    env.EMAIL_API_URL,
    env.EMAIL_FROM,
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.MICROSOFT_CLIENT_ID,
    env.MICROSOFT_CLIENT_SECRET,
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    env.OIDC_ISSUER,
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
  ]);
}

function resolveSecret(env: Env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.ENVIRONMENT === 'development') {
    console.warn('[auth] SESSION_SECRET missing — using an INSECURE development fallback.');
    return DEV_FALLBACK_SECRET;
  }
  throw new Error('SESSION_SECRET is required outside development');
}

function resolveBaseURL(env: Env): string {
  if (env.AUTH_BASE_URL) return env.AUTH_BASE_URL.replace(/\/$/, '');
  if (env.ENVIRONMENT === 'development') return 'http://localhost:8787';
  throw new Error('AUTH_BASE_URL is required outside development (public origin of this API)');
}

export function getAuth(env: Env): ConaiAuth {
  if (!env.DB) throw new Error('D1 binding (DB) is required for authentication');
  const key = authCacheKey(env);
  // DB reference participates: tests (and future multi-DB setups) can swap bindings.
  if (cache && cache.key === key && cache.db === env.DB) return cache.auth;

  const auth = createConaiAuth({
    db: env.DB,
    secret: resolveSecret(env),
    baseURL: resolveBaseURL(env),
    trustedOrigins: allowedOrigins(env),
    environment: env.ENVIRONMENT,
    crossSubdomain: env.ROUTING_MODE === 'subdomain',
    cookieDomain: env.COOKIE_DOMAIN,
    email: createEmailSender(env),
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
    oauth: env,
  });
  cache = { key, db: env.DB, auth };
  return auth;
}

/** Providers with configured credentials — used by GET /api/v1/auth/providers. */
export function enabledSocialProviders(env: Env): string[] {
  return configuredSocialProviders(env);
}
