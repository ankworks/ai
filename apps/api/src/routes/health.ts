import type { Hono } from 'hono';
import type { HealthCheck, HealthResponse } from '@conai/shared';
import type { AppEnv } from '../env';

/**
 * Isolate start time, captured lazily on the first request: workerd evaluates module
 * scope before its clock is set (Date.now() === 0 at init), so capturing on module
 * load would yield epoch-based "uptime".
 */
let startedAtMs: number | undefined;
function uptimeSeconds(): number {
  const now = Date.now();
  startedAtMs ??= now;
  return Math.max(0, Math.floor((now - startedAtMs) / 1000));
}

async function probeD1(db: D1Database | undefined): Promise<HealthCheck> {
  if (!db) return { name: 'd1', status: 'not_configured' };
  const t0 = performance.now();
  try {
    await db.prepare('SELECT 1 AS ok').first();
    return { name: 'd1', status: 'ok', latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      name: 'd1',
      status: 'down',
      latencyMs: Math.round(performance.now() - t0),
      detail: e instanceof Error ? e.message : 'query failed',
    };
  }
}

async function probeKv(kv: KVNamespace | undefined): Promise<HealthCheck> {
  if (!kv) return { name: 'kv', status: 'not_configured' };
  const t0 = performance.now();
  try {
    await kv.get('health:probe');
    return { name: 'kv', status: 'ok', latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      name: 'kv',
      status: 'down',
      latencyMs: Math.round(performance.now() - t0),
      detail: e instanceof Error ? e.message : 'read failed',
    };
  }
}

export function registerHealthRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/health', async (c) => {
    const [d1, kv] = await Promise.all([probeD1(c.env.DB), probeKv(c.env.CACHE)]);
    const checks = [d1, kv];

    const status: HealthResponse['status'] = checks.some((ch) => ch.status === 'down')
      ? 'down'
      : 'ok';

    const body: HealthResponse = {
      status,
      version: c.env.APP_VERSION,
      environment: c.env.ENVIRONMENT,
      routingMode: c.env.ROUTING_MODE,
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
      checks,
    };

    return c.json(body, status === 'down' ? 503 : 200);
  });
}
