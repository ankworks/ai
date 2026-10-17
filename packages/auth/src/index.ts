/**
 * Authentication contracts (Phase 1 constants; better-auth wiring lands in Phase 2 —
 * see ARCHITECTURE.md §7 and SECURITY.md §2/§3).
 *
 * Admin sessions are fully separate from user sessions: different cookie name, MFA
 * required, rejected on user-plane routes (and vice versa).
 */

export const SESSION_COOKIES = {
  user: 'conai_session',
  admin: 'conai_admin_session',
  csrf: 'conai_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';

/** Cookie attributes required on every session cookie (SECURITY.md §2/§8). */
export const SESSION_COOKIE_ATTRS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  path: '/',
};

/** Idle/absolute lifetimes (seconds). Admin sessions are shorter. */
export const SESSION_TTL = {
  userIdle: 60 * 60 * 24 * 30, // 30 days
  userAbsolute: 60 * 60 * 24 * 90, // 90 days
  adminIdle: 60 * 60 * 8, // 8 hours
  adminTrustedDevice: 60 * 60 * 24 * 30, // 30 days
} as const;

export type UserRole = 'user';
export type AdminRoleName =
  'owner' | 'administrator' | 'moderator' | 'student_reviewer' | 'ai_manager' | 'support_agent';

/** Shape returned by the API to frontends after authentication (never contains secrets). */
export interface SessionUserDto {
  id: string;
  username: string;
  displayName: string;
  emailVerified: boolean;
  plan: string;
}

export interface AdminSessionDto {
  id: string;
  displayName: string;
  role: AdminRoleName;
  mfaVerified: boolean;
  trustedDevice: boolean;
}
