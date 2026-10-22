/**
 * Phase 6 route tests — admin plane:
 * separate admin better-auth instance (conai_admin cookies), Owner bootstrap
 * from ADMIN_OWNER_EMAILS, sign-up disabled, TOTP MFA enrollment gate,
 * roster/permission enforcement (admin.* matrix), user lock/unlock, settings,
 * immutable audit log, CSRF on admin mutations, session-plane isolation.
 */

import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { createApp } from '../src/app';
import type { Env } from '../src/env';
import { makeApp, realDb, type ErrorBody } from './helpers';

const ORIGIN = 'http://localhost:5175';
const PASSWORD = 'Str0ngPass!42';
const OWNER_EMAIL = 'owner@conai.test';
const SECOND_OWNER = 'owner2@conai.test';
const MOD_EMAIL = 'mod@conai.test';
const USER_EMAIL = 'plain@conai.test';

let n = 0;
function rid(): string {
  n += 1;
  return `p6${n}${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

interface Harness {
  app: ReturnType<typeof createApp>;
  env: Env;
  sqlite: DatabaseSync;
}

function harness(ownerEmails = `${OWNER_EMAIL},${SECOND_OWNER}`): Harness {
  const { db, sqlite } = realDb();
  const { app, env } = makeApp({ ADMIN_OWNER_EMAILS: ownerEmails }, { DB: db });
  return { app, env, sqlite };
}

const jsonHeaders = (extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json',
  Origin: ORIGIN,
  ...extra,
});

/** Sign a user up through the USER-plane API and mark the email verified. */
async function signup(
  app: ReturnType<typeof createApp>,
  env: Env,
  sqlite: DatabaseSync,
  email: string,
): Promise<string> {
  const res = await app.request(
    '/api/auth/sign-up/email',
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        email,
        password: PASSWORD,
        name: email.split('@')[0],
        username: rid(),
      }),
    },
    env,
  );
  expect(res.status, `signup ${email}`).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  sqlite.prepare('UPDATE "user" SET "emailVerified" = 1 WHERE id = ?').run(body.user.id);
  return body.user.id;
}

/** Cookie jar helper — admin flows rotate cookies (TOTP verify re-issues sessions). */
function syncJar(jar: Map<string, string>, setCookie: string[] | undefined): void {
  for (const raw of setCookie ?? []) {
    const pair = raw.split(';')[0];
    if (!pair) continue;
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
}
const jarHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function adminRequest(
  h: Harness,
  jar: Map<string, string>,
  path: string,
  init: { method?: string; body?: unknown; csrf?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.size) headers.Cookie = jarHeader(jar);
  if (init.csrf) {
    const token = jar.get('conai_csrf');
    if (token) headers['x-csrf-token'] = token;
  }
  const res = await h.app.request(
    path,
    {
      method: init.method ?? 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    },
    h.env,
  );
  syncJar(jar, res.headers.getSetCookie?.());
  return res;
}

/** Mint the double-submit CSRF cookie through the admin endpoint. */
async function mintCsrf(h: Harness, jar: Map<string, string>): Promise<void> {
  const res = await adminRequest(h, jar, '/api/admin/csrf');
  expect(res.status).toBe(200);
  syncJar(jar, res.headers.getSetCookie?.());
}

/**
 * Admin-plane sign-in, completing the TOTP challenge when the account has 2FA.
 * Returns the response of the final step; the jar holds the session cookie.
 */
async function adminSignIn(
  h: Harness,
  email: string,
  jar: Map<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await adminRequest(h, jar, '/api/admin-auth/sign-in/email', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.twoFactorRedirect !== true) return { status: res.status, body };

  // The stored secret is encrypted; tests captured the raw secret at enable time.
  const secret = totpSecrets.get(email);
  expect(secret, `TOTP secret known for ${email}`).toBeTruthy();
  const code = await createOTP(secret!, { digits: 6, period: 30 }).totp();
  const verify = await adminRequest(h, jar, '/api/admin-auth/two-factor/verify-totp', {
    method: 'POST',
    body: { code },
  });
  return {
    status: verify.status,
    body: (await verify.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

/** Email → raw TOTP secret (only available in tests, captured at enable time). */
const totpSecrets = new Map<string, string>();

async function enrollTotp(h: Harness, email: string, jar: Map<string, string>): Promise<void> {
  const enable = await adminRequest(h, jar, '/api/admin-auth/two-factor/enable', {
    method: 'POST',
    body: { password: PASSWORD, method: 'totp', issuer: 'ConAI Admin' },
  });
  expect(enable.status).toBe(200);
  const data = (await enable.json()) as { totpURI: string; backupCodes: string[] };
  const encoded = new URL(data.totpURI).searchParams.get('secret');
  expect(encoded).toBeTruthy();
  expect(data.backupCodes.length).toBeGreaterThan(0);
  // The URI carries a BASE32-encoded secret; the plugin verifies against the raw string.
  const secret = new TextDecoder().decode(base32.decode(encoded!));
  totpSecrets.set(email, secret);

  const code = await createOTP(secret!, { digits: 6, period: 30 }).totp();
  const verify = await adminRequest(h, jar, '/api/admin-auth/two-factor/verify-totp', {
    method: 'POST',
    body: { code },
  });
  expect(verify.status).toBe(200);
  // Session cookie was rotated — confirm our own mirror + the MFA gate.
  await mintCsrf(h, jar);
  const confirm = await adminRequest(h, jar, '/api/admin/me/confirm-mfa', {
    method: 'POST',
    body: {},
    csrf: true,
  });
  expect(confirm.status).toBe(200);
}

describe('Phase 6 — admin authentication plane', () => {
  it('rejects self-serve sign-up on the admin instance', async () => {
    const h = harness();
    const res = await h.app.request(
      '/api/admin-auth/sign-up/email',
      {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: 'x@conai.test', password: PASSWORD, name: 'x' }),
      },
      h.env,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(
      h.sqlite.prepare('SELECT count(*) AS n FROM "user" WHERE email = ?').get('x@conai.test'),
    ).toEqual({ n: 0 });
  });

  it('refuses admin sign-in for ordinary users (no roster row, not an owner email)', async () => {
    const h = harness();
    await signup(h.app, h.env, h.sqlite, USER_EMAIL);
    const jar = new Map<string, string>();
    const { status, body } = await adminSignIn(h, USER_EMAIL, jar);
    expect(status).toBe(403);
    expect(body.code).toBe('ADMIN_ACCESS_REQUIRED');
    expect([...jar.keys()].some((k) => k.startsWith('conai_admin'))).toBe(false);
  });

  it('bootstraps the Owner role from ADMIN_OWNER_EMAILS and writes an audit row', async () => {
    const h = harness();
    await signup(h.app, h.env, h.sqlite, OWNER_EMAIL);
    const jar = new Map<string, string>();
    const { status } = await adminSignIn(h, OWNER_EMAIL, jar);
    expect(status).toBe(200);
    expect(jar.get('conai_admin.session_token')).toBeTruthy();

    const member = h.sqlite
      .prepare(
        'SELECT role, status, mfa_enrolled FROM admin_members WHERE user_id = (SELECT id FROM "user" WHERE email = ?)',
      )
      .get(OWNER_EMAIL) as { role: string; status: string; mfa_enrolled: number };
    expect(member).toMatchObject({ role: 'owner', status: 'active', mfa_enrolled: 0 });

    const audit = h.sqlite
      .prepare("SELECT count(*) AS n FROM admin_audit_log WHERE action = 'admin.bootstrap'")
      .get() as { n: number };
    expect(audit.n).toBe(1);
  });

  it('keeps the plane closed when ADMIN_OWNER_EMAILS is empty', async () => {
    const h = harness('');
    await signup(h.app, h.env, h.sqlite, OWNER_EMAIL);
    const jar = new Map<string, string>();
    const { status, body } = await adminSignIn(h, OWNER_EMAIL, jar);
    expect(status).toBe(403);
    expect(body.code).toBe('ADMIN_ACCESS_REQUIRED');
  });

  it('enforces MFA before any admin route except /me and confirm-mfa', async () => {
    const h = harness();
    await signup(h.app, h.env, h.sqlite, OWNER_EMAIL);
    const jar = new Map<string, string>();
    await adminSignIn(h, OWNER_EMAIL, jar);

    const me = await adminRequest(h, jar, '/api/admin/me');
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { admin: { mfaEnrolled: boolean; role: string } };
    expect(meBody.admin.mfaEnrolled).toBe(false);
    expect(meBody.admin.role).toBe('owner');

    const blocked = await adminRequest(h, jar, '/api/admin/dashboard');
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as ErrorBody).error.code).toBe('mfa_required');

    await enrollTotp(h, OWNER_EMAIL, jar);
    const me2 = (await (await adminRequest(h, jar, '/api/admin/me')).json()) as {
      admin: { mfaEnrolled: boolean };
    };
    expect(me2.admin.mfaEnrolled).toBe(true);

    const dash = await adminRequest(h, jar, '/api/admin/dashboard');
    expect(dash.status).toBe(200);
    const dashBody = (await dash.json()) as { counts: Record<string, number> };
    expect(dashBody.counts.users).toBeGreaterThanOrEqual(1);
    expect(dashBody.counts.admins).toBe(1);
  });

  it('requires TOTP on later sign-ins once enrolled', async () => {
    const h = harness();
    await signup(h.app, h.env, h.sqlite, OWNER_EMAIL);
    const first = new Map<string, string>();
    await adminSignIn(h, OWNER_EMAIL, first);
    await enrollTotp(h, OWNER_EMAIL, first);

    const second = new Map<string, string>();
    const signIn = await adminRequest(h, second, '/api/admin-auth/sign-in/email', {
      method: 'POST',
      body: { email: OWNER_EMAIL, password: PASSWORD },
    });
    const signInBody = (await signIn.json()) as Record<string, unknown>;
    expect(signInBody.twoFactorRedirect).toBe(true);
    // The 2FA step clears any session cookie (empty value) — no usable token yet.
    expect(second.get('conai_admin.session_token') || undefined).toBeUndefined();

    const { status } = await adminSignIn(h, OWNER_EMAIL, second);
    expect(status).toBe(200);
    expect(second.get('conai_admin.session_token')).toBeTruthy();
  });

  it('never accepts a user-plane session cookie on admin routes', async () => {
    const h = harness();
    await signup(h.app, h.env, h.sqlite, OWNER_EMAIL);
    const adminJar = new Map<string, string>();
    await adminSignIn(h, OWNER_EMAIL, adminJar);
    await enrollTotp(h, OWNER_EMAIL, adminJar);

    const userJar = new Map<string, string>([['conai.session_token', 'fake-user-plane-token']]);
    const res = await adminRequest(h, userJar, '/api/admin/me');
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorBody).error.code).toBe('admin_session_required');
  });
});

describe('Phase 6 — admin operations', () => {
  /** Owner fully signed in + MFA-enrolled, plus a plain user to operate on. */
  async function readyHarness(): Promise<{
    h: Harness;
    owner: Map<string, string>;
    plainId: string;
  }> {
    const h = harness();
    await signup(h.app, h.env, h.sqlite, OWNER_EMAIL);
    const owner = new Map<string, string>();
    await adminSignIn(h, OWNER_EMAIL, owner);
    await enrollTotp(h, OWNER_EMAIL, owner);
    const plainId = await signup(h.app, h.env, h.sqlite, USER_EMAIL);
    return { h, owner, plainId };
  }

  it('lists, searches and reads users with profile/wallet joins', async () => {
    const { h, owner } = await readyHarness();
    const list = await adminRequest(h, owner, '/api/admin/users');
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      total: number;
      users: Array<{ id: string; email: string }>;
    };
    expect(listBody.total).toBeGreaterThanOrEqual(2);
    expect(listBody.users.some((u) => u.email === USER_EMAIL)).toBe(true);

    const search = await adminRequest(
      h,
      owner,
      `/api/admin/users?q=${encodeURIComponent('plain')}`,
    );
    const searchBody = (await search.json()) as { users: Array<{ email: string }> };
    expect(searchBody.users).toHaveLength(1);
    expect(searchBody.users[0]?.email).toBe(USER_EMAIL);

    const detail = await adminRequest(h, owner, `/api/admin/users/${listBody.users[0]!.id ?? ''}`);
    expect(detail.status).toBe(200);
  });

  it('locks a user (blocking new user-plane sessions) and unlocks', async () => {
    const { h, owner, plainId } = await readyHarness();

    const lock = await adminRequest(h, owner, `/api/admin/users/${plainId}/lock`, {
      method: 'POST',
      body: { reason: 'test' },
      csrf: true,
    });
    expect(lock.status).toBe(200);

    const banned = h.sqlite.prepare('SELECT banned FROM "user" WHERE id = ?').get(plainId) as {
      banned: number;
    };
    expect(banned.banned).toBe(1);

    // User-plane sign-in must now be refused by the banned-session hook.
    const blocked = await h.app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: PASSWORD }),
      },
      h.env,
    );
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { code?: string }).code).toBe('ACCOUNT_BANNED');

    const unlock = await adminRequest(h, owner, `/api/admin/users/${plainId}/unlock`, {
      method: 'POST',
      body: {},
      csrf: true,
    });
    expect(unlock.status).toBe(200);
    const restored = await h.app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: PASSWORD }),
      },
      h.env,
    );
    expect(restored.status).toBe(200);
  });

  it('refuses self-lock', async () => {
    const { h, owner } = await readyHarness();
    const ownerId = h.sqlite.prepare('SELECT id FROM "user" WHERE email = ?').get(OWNER_EMAIL) as {
      id: string;
    };
    const res = await adminRequest(h, owner, `/api/admin/users/${ownerId.id}/lock`, {
      method: 'POST',
      body: {},
      csrf: true,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe('self_lock');
  });

  it('grants a moderator, enforces their permission matrix, and logs everything', async () => {
    const { h, owner } = await readyHarness();
    await signup(h.app, h.env, h.sqlite, MOD_EMAIL);

    const grant = await adminRequest(h, owner, '/api/admin/admins', {
      method: 'POST',
      body: { email: MOD_EMAIL, role: 'moderator' },
      csrf: true,
    });
    expect(grant.status).toBe(200);

    const modJar = new Map<string, string>();
    const signIn = await adminSignIn(h, MOD_EMAIL, modJar);
    expect(signIn.status).toBe(200);
    await enrollTotp(h, MOD_EMAIL, modJar);

    // Moderator may view users and the audit log…
    expect((await adminRequest(h, modJar, '/api/admin/users')).status).toBe(200);
    expect((await adminRequest(h, modJar, '/api/admin/audit')).status).toBe(200);
    // …but cannot manage settings or grant roles.
    expect((await adminRequest(h, modJar, '/api/admin/settings')).status).toBe(403);
    const forbiddenGrant = await adminRequest(h, modJar, '/api/admin/admins', {
      method: 'POST',
      body: { email: USER_EMAIL, role: 'support_agent' },
      csrf: true,
    });
    expect(forbiddenGrant.status).toBe(403);

    // Owner sees the grant event in the immutable audit trail.
    const audit = await adminRequest(h, owner, '/api/admin/audit?action=admin.role.grant');
    const auditBody = (await audit.json()) as {
      events: Array<{ action: string; actor_name: string }>;
    };
    expect(auditBody.events.length).toBeGreaterThan(0);
    expect(auditBody.events.every((e) => e.action === 'admin.role.grant')).toBe(true);
  });

  it('blocks self-revocation and only Owners can revoke another Owner', async () => {
    const { h, owner } = await readyHarness();
    const ownerId = (
      h.sqlite.prepare('SELECT id FROM "user" WHERE email = ?').get(OWNER_EMAIL) as { id: string }
    ).id;

    const self = await adminRequest(h, owner, `/api/admin/admins/${ownerId}`, {
      method: 'DELETE',
      csrf: true,
    });
    expect(self.status).toBe(400);
    expect(((await self.json()) as ErrorBody).error.code).toBe('self_revoke');

    // Promote a second Owner — an Owner revoking a different Owner is allowed.
    await signup(h.app, h.env, h.sqlite, SECOND_OWNER);
    const grant2 = await adminRequest(h, owner, '/api/admin/admins', {
      method: 'POST',
      body: { email: SECOND_OWNER, role: 'owner' },
      csrf: true,
    });
    expect(grant2.status).toBe(200);
    const secondId = (
      h.sqlite.prepare('SELECT id FROM "user" WHERE email = ?').get(SECOND_OWNER) as { id: string }
    ).id;
    const revoke = await adminRequest(h, owner, `/api/admin/admins/${secondId}`, {
      method: 'DELETE',
      csrf: true,
    });
    expect(revoke.status).toBe(200);

    // A moderator can never touch an Owner row (admin.grant_owner is Owner-only).
    await signup(h.app, h.env, h.sqlite, MOD_EMAIL);
    await adminRequest(h, owner, '/api/admin/admins', {
      method: 'POST',
      body: { email: MOD_EMAIL, role: 'moderator' },
      csrf: true,
    });
    const modJar = new Map<string, string>();
    await adminSignIn(h, MOD_EMAIL, modJar);
    await enrollTotp(h, MOD_EMAIL, modJar);
    const modAttempt = await adminRequest(h, modJar, `/api/admin/admins/${ownerId}`, {
      method: 'DELETE',
      csrf: true,
    });
    expect(modAttempt.status).toBe(403);
  });

  it('rejects grants to unknown users and invalid roles', async () => {
    const { h, owner } = await readyHarness();
    const unknown = await adminRequest(h, owner, '/api/admin/admins', {
      method: 'POST',
      body: { email: 'ghost@conai.test', role: 'moderator' },
      csrf: true,
    });
    expect(unknown.status).toBe(404);

    const invalid = await adminRequest(h, owner, '/api/admin/admins', {
      method: 'POST',
      body: { email: USER_EMAIL, role: 'wizard' },
      csrf: true,
    });
    expect(invalid.status).toBe(400);
  });

  it('updates allowlisted platform settings and rejects unknown keys', async () => {
    const { h, owner } = await readyHarness();
    const ok = await adminRequest(h, owner, '/api/admin/settings', {
      method: 'PUT',
      body: { key: 'referral.reward', value: { sparks: 100 } },
      csrf: true,
    });
    expect(ok.status).toBe(200);

    const row = h.sqlite
      .prepare("SELECT value FROM platform_settings WHERE key = 'referral.reward'")
      .get() as { value: string };
    expect(JSON.parse(row.value)).toEqual({ sparks: 100 });

    const bad = await adminRequest(h, owner, '/api/admin/settings', {
      method: 'PUT',
      body: { key: 'secret.backdoor', value: { x: 1 } },
      csrf: true,
    });
    expect(bad.status).toBe(400);
  });

  it('blocks admin mutations without the double-submit CSRF token', async () => {
    const { h, owner, plainId } = await readyHarness();
    const res = await adminRequest(h, owner, `/api/admin/users/${plainId}/lock`, {
      method: 'POST',
      body: { reason: 'no token' },
      // csrf omitted — cookie exists? no conai_csrf minted in this fresh flow either
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorBody).error.code).toBe('csrf_failed');
  });

  it('locks an admin roster row: existing sessions are rejected and sign-in is refused', async () => {
    const { h, owner } = await readyHarness();
    await signup(h.app, h.env, h.sqlite, MOD_EMAIL);
    await adminRequest(h, owner, '/api/admin/admins', {
      method: 'POST',
      body: { email: MOD_EMAIL, role: 'moderator' },
      csrf: true,
    });
    const modJar = new Map<string, string>();
    await adminSignIn(h, MOD_EMAIL, modJar);
    await enrollTotp(h, MOD_EMAIL, modJar);
    expect((await adminRequest(h, modJar, '/api/admin/me')).status).toBe(200);

    const modId = (
      h.sqlite.prepare('SELECT id FROM "user" WHERE email = ?').get(MOD_EMAIL) as { id: string }
    ).id;
    h.sqlite.prepare("UPDATE admin_members SET status = 'locked' WHERE user_id = ?").run(modId);

    // Existing cookie is rejected at the guard.
    const existing = await adminRequest(h, modJar, '/api/admin/me');
    expect(existing.status).toBe(403);
    expect(((await existing.json()) as ErrorBody).error.code).toBe('admin_locked');

    // Fresh sign-in is refused by the session gate.
    const fresh = new Map<string, string>();
    const { status, body } = await adminSignIn(h, MOD_EMAIL, fresh);
    expect(status).toBe(403);
    expect(body.code).toBe('ADMIN_LOCKED');
  });
});
