/**
 * Smart Memory routes (Phase 4, spec §8) — opt-in, approve-to-save:
 *   GET    /api/v1/ai/memory           — own memories (?status=suggested|approved|rejected)
 *   POST   /api/v1/ai/memory           — add one (source=user ⇒ approved;
 *                                         source=model ⇒ status=suggested, never auto-used)
 *   PATCH  /api/v1/ai/memory/:id       — approve/reject, enable/disable, edit content
 *   DELETE /api/v1/ai/memory/:id       — delete one
 *   DELETE /api/v1/ai/memory           — delete all
 *
 * Only approved+enabled rows ever reach the model prompt (ai/system-prompt.ts).
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { errorResponse } from '../middleware/security';
import { requireSession } from './me';

interface MemoryRow {
  id: string;
  content: string;
  status: 'suggested' | 'approved' | 'rejected';
  enabled: number;
  source: 'user' | 'model';
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

const createSchema = z.object({
  content: z.string().min(1).max(2000),
  source: z.enum(['user', 'model']).optional(),
  sourceMessageId: z.string().max(64).optional(),
});

const patchSchema = z
  .object({
    content: z.string().min(1).max(2000).optional(),
    status: z.enum(['suggested', 'approved', 'rejected']).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.content !== undefined || v.status !== undefined || v.enabled !== undefined, {
    message: 'empty patch',
  });

export function registerMemoryRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/ai/memory', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const status = c.req.query('status');
    const rows =
      status && ['suggested', 'approved', 'rejected'].includes(status)
        ? await db
            .prepare(
              'SELECT * FROM user_memories WHERE user_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 200',
            )
            .bind(session.user.id, status)
            .all<MemoryRow>()
        : await db
            .prepare(
              'SELECT * FROM user_memories WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200',
            )
            .bind(session.user.id)
            .all<MemoryRow>();

    const all = (rows.results ?? []) as unknown as MemoryRow[];
    return c.json({
      memories: all,
      counts: {
        suggested: all.filter((m) => m.status === 'suggested').length,
        approved: all.filter((m) => m.status === 'approved' && m.enabled === 1).length,
        rejected: all.filter((m) => m.status === 'rejected').length,
      },
    });
  });

  app.post('/api/v1/ai/memory', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const body = await c.req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Invalid memory', 400, c.get('requestId'));

    const source = parsed.data.source ?? 'user';
    // Spec: manual entries are saved because the user explicitly added them;
    // anything model-sourced starts as a suggestion and needs approval.
    const status = source === 'user' ? 'approved' : 'suggested';
    const now = new Date().toISOString();
    const row = await db
      .prepare(
        `INSERT INTO user_memories (id, user_id, content, status, enabled, source, source_message_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
         RETURNING *`,
      )
      .bind(
        crypto.randomUUID(),
        session.user.id,
        parsed.data.content.trim(),
        status,
        source,
        parsed.data.sourceMessageId ?? null,
        now,
        now,
      )
      .first<MemoryRow>();
    return c.json({ memory: row }, 201);
  });

  app.patch('/api/v1/ai/memory/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const body = await c.req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Invalid patch', 400, c.get('requestId'));

    const existing = await db
      .prepare('SELECT id FROM user_memories WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), session.user.id)
      .first<{ id: string }>();
    if (!existing) return errorResponse('not_found', 'Memory not found', 404, c.get('requestId'));

    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const binds: unknown[] = [now];
    if (parsed.data.content !== undefined) {
      sets.push('content = ?');
      binds.push(parsed.data.content.trim());
    }
    if (parsed.data.status !== undefined) {
      sets.push('status = ?');
      binds.push(parsed.data.status);
    }
    if (parsed.data.enabled !== undefined) {
      sets.push('enabled = ?');
      binds.push(parsed.data.enabled ? 1 : 0);
    }
    binds.push(c.req.param('id'), session.user.id);
    const updated = await db
      .prepare(
        `UPDATE user_memories SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      )
      .bind(...binds)
      .first<MemoryRow>();
    return c.json({ memory: updated });
  });

  app.delete('/api/v1/ai/memory/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const res = await db
      .prepare('DELETE FROM user_memories WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), session.user.id)
      .run();
    if (!res.meta.changes)
      return errorResponse('not_found', 'Memory not found', 404, c.get('requestId'));
    return c.body(null, 204);
  });

  app.delete('/api/v1/ai/memory', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const res = await db
      .prepare('DELETE FROM user_memories WHERE user_id = ?')
      .bind(session.user.id)
      .run();
    return c.json({ deleted: res.meta.changes });
  });
}
