/**
 * Double-submit CSRF helpers for ConAI-owned API routes (`/api/v1/*`).
 *
 * better-auth's own endpoints (`/api/auth/*`) ship with built-in Origin + Fetch-Metadata
 * CSRF checks; these helpers cover OUR routes (SECURITY.md §3):
 *   - `conai_csrf` cookie is readable by JS (double-submit requires it), SameSite=Lax.
 *   - Every state-changing request must echo the cookie value in `X-CSRF-Token`.
 */

import { CSRF_HEADER, SESSION_COOKIES } from './constants.ts';

export { CSRF_HEADER };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isStateChanging(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function parseCookies(header: string | null | undefined): Map<string, string> {
  const jar = new Map<string, string>();
  if (!header) return jar;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) jar.set(name, decodeURIComponent(value));
  }
  return jar;
}

export interface CsrfCheckInput {
  method: string;
  cookieHeader: string | null | undefined;
  headerToken: string | null | undefined;
}

/** Constant-time-ish comparison for CSRF tokens. */
export function csrfTokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns 'ok' for safe methods / valid tokens, or a failure reason. */
export function checkCsrf(input: CsrfCheckInput): { ok: true } | { ok: false; reason: string } {
  if (!isStateChanging(input.method)) return { ok: true };
  const cookies = parseCookies(input.cookieHeader);
  const cookieToken = cookies.get(SESSION_COOKIES.csrf);
  if (!cookieToken) return { ok: false, reason: 'missing_csrf_cookie' };
  if (!input.headerToken) return { ok: false, reason: 'missing_csrf_header' };
  if (!csrfTokensMatch(cookieToken, input.headerToken)) {
    return { ok: false, reason: 'csrf_token_mismatch' };
  }
  return { ok: true };
}

export interface NewCsrfToken {
  name: string;
  value: string;
  attributes: string;
}

/** Mint a fresh double-submit token + cookie attribute string. */
export function createCsrfCookie(
  secure: boolean,
  token: string = crypto.randomUUID(),
): NewCsrfToken {
  const attrs = ['Path=/', 'SameSite=Lax', 'Max-Age=86400', ...(secure ? ['Secure'] : [])].join(
    '; ',
  );
  return { name: SESSION_COOKIES.csrf, value: token, attributes: attrs };
}
