import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { vi } from 'vitest';
import { createApp } from '../src/app';
import { parseEnv, type Env } from '../src/env';

export interface ErrorBody {
  error: { code: string; message: string; requestId?: string };
}

export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export const META = { duration: 0, changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 };

/**
 * Real SQLite (node:sqlite) behind a D1-style surface, loaded with the actual
 * migrations (0001 + generated 0002) — better-auth's schema validation and our
 * raw SQL both run for real. Returns a fresh isolated DB per call.
 */
export function realDb(): { db: D1Database; sqlite: DatabaseSync } {
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

export function fakeKv(): { binding: KVNamespace; store: Map<string, string> } {
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

export function makeApp(
  envOverrides: Partial<Record<string, string>> = {},
  bindings: Partial<Env> = {},
) {
  const env = parseEnv({ ALLOWED_ORIGINS: 'http://localhost:5175', ...envOverrides });
  const app = createApp();
  return { app, env: { ...env, ...bindings } };
}

/**
 * Sign-up + verify + sign-in against an app whose DB binding is `sqlite`'s
 * wrapper. Returns the session cookie value for `Cookie:` headers.
 */
export async function createSession(
  app: ReturnType<typeof createApp>,
  env: Env,
  sqlite: DatabaseSync,
  opts: { email: string; username: string },
): Promise<{ cookie: string; userId: string }> {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const signup = await app.request(
    '/api/auth/sign-up/email',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5175' },
      body: JSON.stringify({
        email: opts.email,
        password: 'Str0ngPass!42',
        name: 'AI Tester',
        username: opts.username,
      }),
    },
    env,
  );
  warn.mockRestore();
  if (signup.status !== 200) throw new Error(`sign-up failed: ${signup.status}`);
  const body = (await signup.json()) as { user: { id: string } };
  sqlite.prepare('UPDATE "user" SET "emailVerified" = 1 WHERE id = ?').run(body.user.id);

  const signin = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5175' },
      body: JSON.stringify({ email: opts.email, password: 'Str0ngPass!42' }),
    },
    env,
  );
  if (signin.status !== 200) throw new Error(`sign-in failed: ${signin.status}`);
  const cookies = signin.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith('conai.session_token='));
  if (!session) throw new Error('no session cookie');
  return { cookie: session.split(';')[0] ?? session, userId: body.user.id };
}
