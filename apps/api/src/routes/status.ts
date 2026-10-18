import type { Hono } from 'hono';
import {
  STATUS_COMPONENT_IDS,
  type StatusComponent,
  type StatusComponentId,
  type StatusPageResponse,
  type StatusState,
} from '@conai/shared';
import type { AppEnv } from '../env';

/**
 * Public status feed for the status page.
 *
 * Phase 1: component states come ONLY from real signals we have —
 *   • live health probes cached in KV (`status:probe:{id}` written by the Phase 8 cron),
 *   • D1-backed incidents/maintenance/announcements (tables arrive in migration 0008).
 * Components without probe data honestly report `unknown` — states are never fabricated.
 */

const COMPONENT_META: Record<StatusComponentId, { name: string; description: string }> = {
  ai_services: { name: 'AI Services', description: 'Model gateway, streaming responses' },
  authentication: { name: 'Authentication', description: 'Sign-in, sessions, OAuth' },
  workspace: { name: 'Workspace', description: 'Chat, documents, tools' },
  teams: { name: 'Teams', description: 'Projects, channels, automations' },
  database: { name: 'Database', description: 'D1 relational storage' },
  notifications: { name: 'Notifications', description: 'In-app center and Web Push' },
};

const STATE_ORDER: StatusState[] = [
  'major_outage',
  'partial_outage',
  'degraded',
  'maintenance',
  'operational',
];

function isStatusState(v: unknown): v is StatusState {
  return (
    typeof v === 'string' &&
    [
      'operational',
      'degraded',
      'partial_outage',
      'major_outage',
      'maintenance',
      'unknown',
    ].includes(v)
  );
}

async function readProbe(
  kv: KVNamespace | undefined,
  id: StatusComponentId,
): Promise<{ state: StatusState; lastCheckedAt: string | null }> {
  if (!kv) return { state: 'unknown', lastCheckedAt: null };
  try {
    const raw = await kv.get(`status:probe:${id}`);
    if (!raw) return { state: 'unknown', lastCheckedAt: null };
    const parsed = JSON.parse(raw) as { state?: unknown; checkedAt?: unknown };
    return {
      state: isStatusState(parsed.state) ? parsed.state : 'unknown',
      lastCheckedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : null,
    };
  } catch {
    return { state: 'unknown', lastCheckedAt: null };
  }
}

async function queryJsonTable<T>(
  db: D1Database | undefined,
  sql: string,
  fallback: T[],
): Promise<T[]> {
  if (!db) return fallback;
  try {
    const rows = await db.prepare(sql).all<{ json: string }>();
    return rows.results.map((r) => JSON.parse(r.json) as T);
  } catch {
    // Table not migrated yet (Phase 8) — no incidents is the truthful answer today.
    return fallback;
  }
}

export function registerStatusRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/status', async (c) => {
    const components: StatusComponent[] = await Promise.all(
      STATUS_COMPONENT_IDS.map(async (id) => {
        const probe = await readProbe(c.env.CACHE, id);
        const meta = COMPONENT_META[id];
        return {
          id,
          name: meta.name,
          description: meta.description,
          state: probe.state,
          lastCheckedAt: probe.lastCheckedAt,
        };
      }),
    );

    const knownStates = components
      .map((comp) => comp.state)
      .filter((s): s is StatusState => s !== 'unknown');
    const overall: StatusState =
      knownStates.length === 0
        ? 'unknown'
        : (STATE_ORDER.find((s) => knownStates.includes(s)) ?? 'unknown');

    const incidents = await queryJsonTable(c.env.DB, 'SELECT json FROM status_incidents', []);
    const maintenance = await queryJsonTable(c.env.DB, 'SELECT json FROM status_maintenance', []);
    const announcements = await queryJsonTable(
      c.env.DB,
      'SELECT json FROM status_announcements',
      [],
    );

    const body: StatusPageResponse = {
      overall,
      components,
      incidents,
      maintenance,
      announcements,
    };
    return c.json(body, 200, { 'Cache-Control': 'public, max-age=30' });
  });
}
