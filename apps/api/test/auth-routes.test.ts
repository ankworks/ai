import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { parseEnv, type Env } from '../src/env';

interface ErrorBody {
  error: { code: string; message: string; requestId?: string };
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const META = { duration: 0, changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 };

/**
 * Real SQLite (node:sqlite) behind a D1-style surface, loaded with the actual
 * migrations (0001 + generated 0002) — better-auth's schema validation and our
 * raw SQL both run for real. Returns a fresh isolated DB per call.
 */
function realDb(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_init.sql', '0002_auth.sql']) {
    const sql = readFileSync(
      new URL(`../../../packages/database/migrations/${file}`, import.meta.url),
      'utf8',
    );
    sqlite.exec(sql);
  }

  function wrap(sql: string) {
    const isRead = /^\s*(select|pragma)/i.test(sql);
    const exec = (params: unknown[]) => {
      const stmt = sqlite.prepare(sql);
      if (params.length === 0) return stmt;
      return stmt;
    };
    const bind = (...params: unknown[]) => ({
      __isRead: isRead,
      async first() {
        return (
          (exec(params).get(...(params as never[])) as Record<string, unknown> | undefined) ?? null
        );
      },
      async all() {
        return {
          results: exec(params).all(...(params as never[])),
          success: true,
          meta: { ...META },
        };
      },
      async run() {
        const r = exec(params).run(...(params as never[]));
        return {
          success: true,
          results: [],
          meta: { ...META, changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
        };
      },
      async raw() {
        return exec(params).all(...(params as never[]));
      },
    });
    return {
      __isRead: isRead,
      bind,
      async first() {
        return (sqlite.prepare(sql).get() as Record<string, unknown> | undefined) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(), success: true, meta: { ...META } };
      },
      async run() {
        const r = sqlite.prepare(sql).run();
        return {
          success: true,
          results: [],
          meta: { ...META, changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
        };
      },
      async raw() {
        return sqlite.prepare(sql).all();
      },
    };
  }

  const db = {
    prepare: (sql: string) => wrap(sql),
    batch: async (
      stmts: Array<{
        run: () => Promise<unknown>;
        all: () => Promise<unknown>;
        __isRead?: boolean;
      }>,
    ) => {
      // SAVEPOINT (not BEGIN) so hook-driven batches can nest inside the
      // adapter's outer transaction, matching D1 batch semantics.
      sqlite.exec('SAVEPOINT conai_batch');
      try {
        const out = [];
        for (const s of stmts) out.push(s.__isRead ? await s.all() : await s.run());
        sqlite.exec('RELEASE conai_batch');
        return out;
      } catch (error) {
        sqlite.exec('ROLLBACK TO conai_batch');
        sqlite.exec('RELEASE conai_batch');
        throw error;
      }
    },
    exec: async (query: string) => {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;

  return { db, sqlite };
}

function fakeKv(): { binding: KVNamespace; store: Map<string, string> } {
  const store = new Map<string, string>();
  const binding = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    delete: async (k: string) => {
      store.delete(k);
    },
  } as unknown as KVNamespace;
  return { binding, store };
}

function makeApp(envOverrides: Partial<Record<string, string>> = {}, bindings: Partial<Env> = {}) {
  const env = parseEnv({ ALLOWED_ORIGINS: 'http://localhost:5175', ...envOverrides });
  const app = createApp();
  return { app, env: { ...env, ...bindings } };
}

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
    expect(wallet?.balance).toBe(0);

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
