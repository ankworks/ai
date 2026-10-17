/**
 * ConAI better-auth configuration (server-only).
 *
 * Runtime facts (verified against better-auth 1.7.10):
 *  - `database` accepts a Cloudflare D1 binding directly (native D1 dialect,
 *    batch() used instead of interactive transactions — better-auth ≥ 1.5).
 *  - password hashing resolves through @better-auth/utils export conditions; on
 *    Workers the `workerd` condition uses node:crypto scrypt → requires the
 *    `nodejs_compat` compatibility flag (declared in wrangler.jsonc).
 *  - built-in CSRF: Origin + Fetch-Metadata checks on cookie-authenticated POSTs
 *    (we keep our own double-submit layer for /api/v1 routes).
 *  - username plugin validates /sign-up/email bodies and exposes
 *    /is-username-available.
 *  - captcha plugin verifies Turnstile via the `x-captcha-response` header.
 */

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { username } from 'better-auth/plugins/username';
import { captcha } from 'better-auth/plugins/captcha';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import type { EmailSender } from './email.ts';
import { resetPasswordEmail, verificationEmail } from './email.ts';
import { isValidUsername, USERNAME_MAX, USERNAME_MIN } from './username.ts';
import { createAccountShell } from './profile.ts';

export interface OAuthEnv {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  MICROSOFT_CLIENT_ID?: string | undefined;
  MICROSOFT_CLIENT_SECRET?: string | undefined;
  GITHUB_CLIENT_ID?: string | undefined;
  GITHUB_CLIENT_SECRET?: string | undefined;
  OIDC_ISSUER?: string | undefined;
  OIDC_CLIENT_ID?: string | undefined;
  OIDC_CLIENT_SECRET?: string | undefined;
}

export interface ConaiAuthDeps {
  db: D1Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  environment: 'development' | 'staging' | 'production';
  /** Cookie domain mode for subdomain routing (spec §4). */
  crossSubdomain: boolean;
  cookieDomain?: string | undefined;
  email: EmailSender;
  turnstileSecretKey?: string | undefined;
  oauth: OAuthEnv;
}

/** Providers that are actually configured — the UI shows only these (no fake buttons). */
export function configuredSocialProviders(oauth: OAuthEnv): string[] {
  const out: string[] = [];
  if (oauth.GOOGLE_CLIENT_ID && oauth.GOOGLE_CLIENT_SECRET) out.push('google');
  if (oauth.MICROSOFT_CLIENT_ID && oauth.MICROSOFT_CLIENT_SECRET) out.push('microsoft');
  if (oauth.GITHUB_CLIENT_ID && oauth.GITHUB_CLIENT_SECRET) out.push('github');
  if (oauth.OIDC_ISSUER && oauth.OIDC_CLIENT_ID && oauth.OIDC_CLIENT_SECRET) out.push('oidc');
  return out;
}

function accountShellHooks(db: D1Database): NonNullable<BetterAuthOptions['databaseHooks']> {
  return {
    user: {
      create: {
        after: async (user) => {
          await createAccountShell(db, user as unknown as Record<string, unknown>);
        },
      },
    },
  };
}

export function createAuthOptions(deps: ConaiAuthDeps): BetterAuthOptions {
  const { oauth } = deps;

  const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {
    ...(oauth.GOOGLE_CLIENT_ID && oauth.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: oauth.GOOGLE_CLIENT_ID, clientSecret: oauth.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(oauth.MICROSOFT_CLIENT_ID && oauth.MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: oauth.MICROSOFT_CLIENT_ID,
            clientSecret: oauth.MICROSOFT_CLIENT_SECRET,
          },
        }
      : {}),
    ...(oauth.GITHUB_CLIENT_ID && oauth.GITHUB_CLIENT_SECRET
      ? { github: { clientId: oauth.GITHUB_CLIENT_ID, clientSecret: oauth.GITHUB_CLIENT_SECRET } }
      : {}),
  };

  const plugins: NonNullable<BetterAuthOptions['plugins']> = [
    username({
      minUsernameLength: USERNAME_MIN,
      maxUsernameLength: USERNAME_MAX,
      usernameValidator: isValidUsername,
      immutableUsername: false,
    }),
  ];

  if (deps.turnstileSecretKey) {
    plugins.push(
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: deps.turnstileSecretKey,
        // Spec: bot protection on signup + credential flows.
        endpoints: ['/sign-up/email', '/sign-in/email', '/forgot-password'],
      }) as (typeof plugins)[number],
    );
  }

  if (oauth.OIDC_ISSUER && oauth.OIDC_CLIENT_ID && oauth.OIDC_CLIENT_SECRET) {
    const issuer = oauth.OIDC_ISSUER.replace(/\/$/, '');
    plugins.push(
      genericOAuth({
        config: [
          {
            providerId: 'oidc',
            name: 'OpenID Connect',
            discoveryUrl: `${issuer}/.well-known/openid-configuration`,
            clientId: oauth.OIDC_CLIENT_ID,
            clientSecret: oauth.OIDC_CLIENT_SECRET,
            scopes: ['openid', 'profile', 'email'],
          },
        ],
      }) as (typeof plugins)[number],
    );
  }

  return {
    appName: 'ConAI',
    secret: deps.secret,
    baseURL: deps.baseURL,
    trustedOrigins: deps.trustedOrigins,
    telemetry: { enabled: false },
    // Native D1 binding — better-auth detects and uses its built-in D1 dialect.
    database: deps.db,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // Spec §5: email verification required.
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
    socialProviders,
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days idle window (SECURITY.md §2)
      updateAge: 60 * 60 * 24, // refresh at most daily
    },
    advanced: {
      // Session cookie becomes `conai.session_token` (admin instance uses conai_admin).
      cookiePrefix: 'conai',
      useSecureCookies: deps.environment === 'production',
      crossSubDomainCookies: deps.crossSubdomain
        ? { enabled: true, domain: deps.cookieDomain ?? '' }
        : { enabled: false },
    },
    databaseHooks: accountShellHooks(deps.db),
    plugins,
  };
}

/** Factory: builds the better-auth instance for one Worker environment. */
export function createConaiAuth(deps: ConaiAuthDeps) {
  return betterAuth(createAuthOptions(deps));
}

export type ConaiAuth = ReturnType<typeof createConaiAuth>;
