/**
 * User prompt library routes (Phase 4):
 *   GET    /api/v1/ai/prompts   — own saved prompts
 *   POST   /api/v1/ai/prompts   — create {title, body}
 *   PATCH  /api/v1/ai/prompts/:id
 *   DELETE /api/v1/ai/prompts/:id
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { errorResponse } from '../middleware/security';
import { requireSession } from './me';

interface PromptRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

const createSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(10_000),
});

const patchSchema = z
  .object({
    title: z.string().min(1).max(80).optional(),
    body: z.string().min(1).max(10_000).optional(),
  })
  .refine((v) => v.title !== undefined || v.body !== undefined, { message: 'empty patch' });

export function registerPromptRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/ai/prompts', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const rows = await db
      .prepare('SELECT * FROM prompt_library WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200')
      .bind(session.user.id)
      .all<PromptRow>();
    return c.json({ prompts: (rows.results ?? []) as unknown as PromptRow[] });
  });

  app.post('/api/v1/ai/prompts', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const body = await c.req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Invalid prompt', 400, c.get('requestId'));

    const now = new Date().toISOString();
    const row = await db
      .prepare(
        `INSERT INTO prompt_library (id, user_id, title, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        crypto.randomUUID(),
        session.user.id,
        parsed.data.title.trim(),
        parsed.data.body,
        now,
        now,
      )
      .first<PromptRow>();
    return c.json({ prompt: row }, 201);
  });

  app.patch('/api/v1/ai/prompts/:id', async (c) => {
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

    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const binds: unknown[] = [now];
    if (parsed.data.title !== undefined) {
      sets.push('title = ?');
      binds.push(parsed.data.title.trim());
    }
    if (parsed.data.body !== undefined) {
      sets.push('body = ?');
      binds.push(parsed.data.body);
    }
    binds.push(c.req.param('id'), session.user.id);
    const updated = await db
      .prepare(
        `UPDATE prompt_library SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      )
      .bind(...binds)
      .first<PromptRow>();
    if (!updated) return errorResponse('not_found', 'Prompt not found', 404, c.get('requestId'));
    return c.json({ prompt: updated });
  });

  app.delete('/api/v1/ai/prompts/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const res = await db
      .prepare('DELETE FROM prompt_library WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), session.user.id)
      .run();
    if (!res.meta.changes)
      return errorResponse('not_found', 'Prompt not found', 404, c.get('requestId'));
    return c.body(null, 204);
  });
}
