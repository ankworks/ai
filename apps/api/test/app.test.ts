import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { parseEnv, type Env } from '../src/env';

const TEST_ORIGIN = 'http://localhost:5173';

/** Workers' Response.json() types as unknown — tests parse into explicit shapes. */
async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

interface RootBody {
  name: string;
  routingMode: string;
  endpoints: Record<string, string>;
}
interface HealthBody {
  status: string;
  version: string;
  environment: string;
  routingMode: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: Array<{ name: string; status: string; latencyMs?: number }>;
}
interface StatusBody {
  overall: string;
  components: Array<{ id: string; state: string; lastCheckedAt: string | null }>;
  incidents: unknown[];
  maintenance: unknown[];
  announcements: unknown[];
}
interface ErrorBody {
  error: { code: string; message: string; requestId?: string };
}

function makeApp(envOverrides: Partial<Record<string, string>> = {}, bindings: Partial<Env> = {}) {
  const env = parseEnv({ ALLOWED_ORIGINS: TEST_ORIGIN, ...envOverrides });
  const app = createApp();
  return { app, env: { ...env, ...bindings } };
}

describe('GET /', () => {
  it('returns API metadata with endpoint discovery', async () => {
    const { app, env } = makeApp();
    const res = await app.request('/', {}, env);
    expect(res.status).toBe(200);
    const body = await readJson<RootBody>(res);
    expect(body).toMatchObject({
      name: 'ConAI API',
      routingMode: 'path',
      endpoints: { health: '/api/v1/health', status: '/api/v1/status' },
    });
  });
});

describe('GET /api/v1/health', () => {
  it('reports ok with not_configured checks when bindings are absent (local scaffold)', async () => {
    const { app, env } = makeApp();
    const res = await app.request('/api/v1/health', {}, env);
    expect(res.status).toBe(200);
    const body = await readJson<HealthBody>(res);
    expect(body.status).toBe('ok');
    expect(body.routingMode).toBe('path');
    expect(body.checks).toEqual([
      { name: 'd1', status: 'not_configured' },
      { name: 'kv', status: 'not_configured' },
    ]);
    expect(typeof body.uptimeSeconds).toBe('number');
    // Regression guard: workerd's module-init clock returns epoch — uptime must stay sane.
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.uptimeSeconds).toBeLessThan(86_400);
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('performs a real query when D1 is bound', async () => {
    const db = {
      prepare: () => ({ first: async () => ({ ok: 1 }) }),
    } as unknown as D1Database;
    const { app, env } = makeApp({}, { DB: db });
    const res = await app.request('/api/v1/health', {}, env);
    expect(res.status).toBe(200);
    const body = await readJson<HealthBody>(res);
    const d1 = body.checks.find((c) => c.name === 'd1');
    expect(d1?.status).toBe('ok');
    expect(typeof d1?.latencyMs).toBe('number');
  });

  it('returns 503 when a bound dependency is down', async () => {
    const db = {
      prepare: () => ({
        first: async () => {
          throw new Error('disk I/O error');
        },
      }),
    } as unknown as D1Database;
    const { app, env } = makeApp({}, { DB: db });
    const res = await app.request('/api/v1/health', {}, env);
    expect(res.status).toBe(503);
    const body = await readJson<HealthBody>(res);
    expect(body.status).toBe('down');
  });
});

describe('GET /api/v1/status', () => {
  it('lists all six components honestly as unknown without probe data', async () => {
    const { app, env } = makeApp();
    const res = await app.request('/api/v1/status', {}, env);
    expect(res.status).toBe(200);
    const body = await readJson<StatusBody>(res);
    expect(body.components).toHaveLength(6);
    expect(body.overall).toBe('unknown');
    for (const comp of body.components) {
      expect(comp.state).toBe('unknown');
      expect(comp.lastCheckedAt).toBeNull();
    }
    expect(body.incidents).toEqual([]);
    expect(body.maintenance).toEqual([]);
    expect(body.announcements).toEqual([]);
    expect(res.headers.get('Cache-Control')).toContain('max-age');
  });

  it('reflects real probe data from KV when present', async () => {
    const checkedAt = '2026-10-17T10:00:00.000Z';
    const kv = {
      get: async (key: string) =>
        key === 'status:probe:database'
          ? JSON.stringify({ state: 'operational', checkedAt })
          : null,
    } as unknown as KVNamespace;
    const { app, env } = makeApp({}, { CACHE: kv });
    const res = await app.request('/api/v1/status', {}, env);
    const body = await readJson<StatusBody>(res);
    const db = body.components.find((c) => c.id === 'database');
    expect(db?.state).toBe('operational');
    expect(db?.lastCheckedAt).toBe(checkedAt);
    // No fabricated rollout: other components stay unknown, overall = best known state
    expect(body.overall).toBe('operational');
    const ai = body.components.find((c) => c.id === 'ai_services');
    expect(ai?.state).toBe('unknown');
  });
});

describe('security middleware', () => {
  it('sets baseline security headers and echoes request id', async () => {
    const { app, env } = makeApp();
    const res = await app.request(
      '/api/v1/health',
      { headers: { 'X-Request-Id': 'req-test-1' } },
      env,
    );
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('X-Request-Id')).toBe('req-test-1');
  });

  it('allows CORS only for allowlisted origins', async () => {
    const { app, env } = makeApp();
    const allowed = await app.request('/api/v1/health', { headers: { Origin: TEST_ORIGIN } }, env);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(TEST_ORIGIN);
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    const denied = await app.request(
      '/api/v1/health',
      { headers: { Origin: 'https://evil.example' } },
      env,
    );
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects state-changing requests from unknown origins (403)', async () => {
    const { app, env } = makeApp();
    const res = await app.request(
      '/api/v1/anything',
      { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' },
      env,
    );
    expect(res.status).toBe(403);
    const body = await readJson<ErrorBody>(res);
    expect(body.error.code).toBe('origin_not_allowed');
  });

  it('answers preflight for allowlisted origins', async () => {
    const { app, env } = makeApp();
    const res = await app.request(
      '/api/v1/anything',
      { method: 'OPTIONS', headers: { Origin: TEST_ORIGIN } },
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(TEST_ORIGIN);
  });

  it('returns JSON 404 for unknown routes', async () => {
    const { app, env } = makeApp();
    const res = await app.request('/api/v1/nope', {}, env);
    expect(res.status).toBe(404);
    const body = await readJson<ErrorBody>(res);
    expect(body.error.code).toBe('not_found');
  });
});
