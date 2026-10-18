/**
 * Session/CSRF cookie identities for ConAI.
 *
 * better-auth is configured with `cookiePrefix: 'conai'`, producing:
 *   conai.session_token   — user-plane sessions (HttpOnly, Secure in production)
 *   conai.csrf_token?     — better-auth internal CSRF (its own naming)
 * Admin sessions (Phase 6) run a SEPARATE better-auth instance with prefix `conai_admin`,
 * so an admin cookie can never authenticate a user-plane request (and vice versa).
 */
export const SESSION_COOKIES = {
  user: 'conai.session_token',
  admin: 'conai_admin.session_token',
  csrf: 'conai_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';
