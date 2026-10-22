/**
 * ConAI ADMIN better-auth instance (Phase 6).
 *
 * Separate from the user-plane instance (config.ts) by design:
 *  - own basePath `/api/admin-auth` and cookie prefix `conai_admin`, so an admin
 *    cookie can never authenticate a user-plane request and vice versa;
 *  - TOTP two-factor plugin enabled (MFA is mandatory for admin API access —
 *    enforced again in the API guard, not only in the UI);
 *  - self-serve sign-up DISABLED (`disableSignUp`). Admin accounts are created
 *    exclusively by the Owner bootstrap (ADMIN_OWNER_EMAILS) or by another
 *    authorized admin through the admin API;
 *  - a session.create gate hook rejects anyone without an `admin_members` row,
 *    rejects locked/banned admins, and bootstraps the first Owner(s).
 *
 * The same D1 database backs both instances — better-auth core tables are shared,
 * only the cookie namespace and plugin set differ.
 */

import { betterAuth, APIError, type BetterAuthOptions } from 'better-auth';
import { twoFactor } from 'better-auth/plugins/two-factor';
import type { EmailSender } from './email.ts';
import { resetPasswordEmail, verificationEmail } from './email.ts';

export interface ConaiAdminAuthDeps {
  db: D1Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  environment: 'development' | 'staging' | 'production';
  crossSubdomain: boolean;
  cookieDomain?: string | undefined;
  email: EmailSender;
  /** Lowercased, trimmed allowlist parsed from ADMIN_OWNER_EMAILS. */
  ownerEmails: string[];
}

function asId(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Gate every session created through the admin instance. Runs AFTER successful
 * credential (and TOTP) verification, so throwing here prevents any cookie being
 * issued. The first sign-in of a configured owner email self-provisions the
 * Owner row — every other non-member is refused.
 */
function adminGateHooks(
  db: D1Database,
  ownerEmails: string[],
): NonNullable<BetterAuthOptions['databaseHooks']> {
  const owners = new Set(ownerEmails);
  return {
    session: {
      create: {
        before: async (data) => {
          const userId = asId(data.userId);
          if (!userId) {
            throw new APIError('FORBIDDEN', {
              message: 'Invalid session',
              code: 'INVALID_SESSION',
            });
          }

          const user = await db
            .prepare(`SELECT id, email, "emailVerified", banned FROM "user" WHERE id = ?`)
            .bind(userId)
            .first<{ id: string; email: string; emailVerified: number; banned: number }>();

          if (!user) {
            throw new APIError('FORBIDDEN', { message: 'User not found', code: 'USER_NOT_FOUND' });
          }
          if (user.banned === 1) {
            throw new APIError('FORBIDDEN', {
              message: 'Account is banned',
              code: 'ACCOUNT_BANNED',
            });
          }

          const member = await db
            .prepare(`SELECT user_id, role, status FROM admin_members WHERE user_id = ?`)
            .bind(userId)
            .first<{ user_id: string; role: string; status: string }>();

          if (!member) {
            const email = user.email.toLowerCase();
            const isBootstrapOwner = user.emailVerified === 1 && owners.has(email);
            if (!isBootstrapOwner) {
              throw new APIError('FORBIDDEN', {
                message: 'Admin access required',
                code: 'ADMIN_ACCESS_REQUIRED',
              });
            }
            const now = new Date().toISOString();
            await db
              .prepare(
                `INSERT INTO admin_members
                   (user_id, role, custom_permissions, status, mfa_enrolled, created_at, updated_at, created_by)
                 VALUES (?, 'owner', NULL, 'active', 0, ?, ?, NULL)`,
              )
              .bind(userId, now, now)
              .run();
            await db
              .prepare(
                `INSERT INTO admin_audit_log
                   (id, actor_id, actor_name, action, target_type, target_id, metadata, ip_address, created_at)
                 VALUES (?, ?, ?, 'admin.bootstrap', 'admin_member', ?, ?, NULL, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                userId,
                user.email,
                userId,
                JSON.stringify({ role: 'owner', via: 'ADMIN_OWNER_EMAILS' }),
                now,
              )
              .run();
            return;
          }

          if (member.status === 'locked') {
            throw new APIError('FORBIDDEN', {
              message: 'Admin account is locked',
              code: 'ADMIN_LOCKED',
            });
          }
        },
      },
    },
  };
}

export function createAdminAuthOptions(deps: ConaiAdminAuthDeps): BetterAuthOptions {
  return {
    appName: 'ConAI Admin',
    secret: deps.secret,
    baseURL: deps.baseURL,
    basePath: '/api/admin-auth',
    trustedOrigins: deps.trustedOrigins,
    telemetry: { enabled: false },
    database: deps.db,
    // No self-serve admin accounts — owners bootstrap via env, admins add the rest.
    emailAndPassword: {
      enabled: true,
      // 1.7.10 places the sign-up kill switch inside emailAndPassword.
      disableSignUp: true,
      minPasswordLength: 10,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        const body = resetPasswordEmail(url);
        await deps.email.send({ to: user.email, ...body });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const body = verificationEmail(url);
        await deps.email.send({ to: user.email, ...body });
      },
    },
    session: {
      // Shorter idle window than user-plane sessions (SECURITY.md: admin plane).
      expiresIn: 60 * 60 * 12, // 12 hours
      updateAge: 60 * 60, // refresh at most hourly
    },
    advanced: {
      cookiePrefix: 'conai_admin',
      useSecureCookies: deps.environment === 'production',
      crossSubDomainCookies: deps.crossSubdomain
        ? { enabled: true, domain: deps.cookieDomain ?? '' }
        : { enabled: false },
    },
    databaseHooks: adminGateHooks(deps.db, deps.ownerEmails),
    plugins: [
      twoFactor({
        issuer: 'ConAI Admin',
        // 1.7.10 names — `totp`/`backupCodes` are silently ignored.
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10 },
      }),
    ],
  };
}

/** Factory: the admin better-auth instance for one Worker environment. */
export function createConaiAdminAuth(deps: ConaiAdminAuthDeps) {
  return betterAuth(createAdminAuthOptions(deps));
}

export type ConaiAdminAuth = ReturnType<typeof createConaiAdminAuth>;
