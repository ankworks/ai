import { describe, expect, it, vi } from 'vitest';
import { makeApp, readJson, fakeKv, realDb } from './helpers';
import type { ErrorBody } from './helpers';

describe('CSRF layer (/api/v1)', () => {
  it('issues a double-submit cookie + token on safe requests', async () => {
    const { app, env } = makeApp({}, { DB: realDb().db });
    const res = await app.request('/api/v1/csrf', {}, env);
    expect(res.status).toBe(200);
    const body = await readJson<{ token: string }>(res);
    expect(body.token.length).toBeGreaterThan(8);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('conai_csrf=');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('rejects state-changing /api/v1 requests without the cookie', async () => {
    const { app, env } = makeApp({}, { DB: realDb().db });
    const res = await app.request(
      '/api/v1/me',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'guess' },
        body: JSON.stringify({ displayName: 'x' }),
      },
      env,
    );
    expect(res.status).toBe(403);
    const body = await readJson<ErrorBody>(res);
    expect(body.error.code).toBe('csrf_failed');
  });

  it('rejects mismatched double-submit tokens', async () => {
    const { app, env } = makeApp({}, { DB: realDb().db });
    const res = await app.request(
      '/api/v1/me',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'conai_csrf=token-a',
          'X-CSRF-Token': 'token-b',
          Origin: 'http://localhost:5175',
        },
        body: JSON.stringify({ displayName: 'x' }),
      },
      env,
    );
    expect(res.status).toBe(403);
    const body = await readJson<ErrorBody>(res);
    expect(body.error.code).toBe('csrf_failed');
    expect(body.error.message).toContain('mismatch');
  });

  it('returns 401 for /api/v1/me without a session (CSRF passes first)', async () => {
    const { app, env } = makeApp({}, { DB: realDb().db });
    const res = await app.request(
      '/api/v1/me',
      {
        headers: {
          Cookie: 'conai_csrf=token-a',
          'X-CSRF-Token': 'token-a',
          Origin: 'http://localhost:5175',
        },
      },
      env,
    );
    expect(res.status).toBe(401);
    const body = await readJson<ErrorBody>(res);
    expect(body.error.code).toBe('unauthenticated');
  });

  it('serves the seeded plan catalog on safe GETs', async () => {
    const { app, env } = makeApp({}, { DB: realDb().db });
    const res = await app.request('/api/v1/plans', {}, env);
    expect(res.status).toBe(200);
    const body = await readJson<{ plans: Array<{ id: string; dailySparks: number | null }> }>(res);
    expect(body.plans.map((p) => p.id)).toEqual(['personal', 'student', 'teams', 'enterprise']);
    expect(body.plans[0]?.dailySparks).toBe(500);
  });
});

describe('better-auth sign-up bootstrap', () => {
  it('creates user + profile + wallet via the database hook', async () => {
    const { app, env, sqlite } = (() => {
      const { db, sqlite: s } = realDb();
      const built = makeApp({}, { DB: db });
      return { ...built, sqlite: s };
    })();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await app.request(
      '/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5175' },
        body: JSON.stringify({
          email: 'tester@conai.test',
          password: 'Str0ngPass!42',
          name: 'Test User',
          username: 'tester1',
        }),
      },
      env,
    );
    warn.mockRestore();

    expect(res.status).toBe(200);
    const body = await readJson<{ user: { id: string; username: string } }>(res);
    expect(body.user.username).toBe('tester1');
    expect(body.user.id).toBeTruthy();

    const profile = sqlite.prepare('SELECT * FROM user_profiles WHERE id = ?').get(body.user.id) as
      Record<string, unknown> | undefined;
    expect(profile?.username).toBe('tester1');
    expect(profile?.plan_id).toBe('personal');
    expect(typeof profile?.referral_code).toBe('string');

    const wallet = sqlite
      .prepare('SELECT * FROM spark_wallets WHERE user_id = ?')
      .get(body.user.id) as Record<string, unknown> | undefined;
    // First-day grant: free plan's daily allowance is credited at sign-up (spec §7).
    expect(wallet?.balance).toBe(500);

    // Duplicate username is rejected by the username plugin.
    const dup = await app.request(
      '/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5175' },
        body: JSON.stringify({
          email: 'other@conai.test',
          password: 'Str0ngPass!42',
          name: 'Other',
          username: 'tester1',
        }),
      },
      env,
    );
    expect(dup.status).toBe(400);
    const dupBody = await readJson<{ code?: string }>(dup);
    expect(dupBody.code).toBe('USERNAME_IS_ALREADY_TAKEN');
  });
});

describe('rate limiting (KV)', () => {
  it('returns 429 with Retry-After once the sign-in bucket is spent', async () => {
    const { binding } = fakeKv();
    const { app, env } = makeApp({}, { DB: realDb().db, CACHE: binding });

    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 12; i++) {
      const res = await app.request(
        '/api/auth/sign-in/email',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'someone@example.com', password: 'wrong-password' }),
        },
        env,
      );
      statuses.push(res.status);
      if (res.status === 429) retryAfter = res.headers.get('retry-after');
    }

    // Bucket max is 10 per window: early attempts pass through to the auth
    // route (4xx), then the limiter cuts in with 429.
    expect(statuses[0]).not.toBe(429);
    expect(statuses.at(-1)).toBe(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  }, 30_000);

  it('is skipped when no KV binding exists (dev fallback, still functional)', async () => {
    const { app, env } = makeApp({}, { DB: realDb().db });
    const first = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.test', password: 'wrong' }),
      },
      env,
    );
    expect(first.status).not.toBe(429);
  });
});
