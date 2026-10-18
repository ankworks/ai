/**
 * Conversation history routes (Phase 4):
 *   GET    /api/v1/ai/conversations        — own threads, optional `q` search
 *   GET    /api/v1/ai/conversations/:id    — thread + full message list
 *   PATCH  /api/v1/ai/conversations/:id    — rename / pin / set default model
 *   DELETE /api/v1/ai/conversations/:id    — delete thread (messages cascade)
 *
 * Threads are created lazily by the chat route on the first persisted turn.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { errorResponse } from '../middleware/security';
import { requireSession } from './me';

const listQuerySchema = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const patchSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
    model: z.string().min(1).max(100).nullable().optional(),
  })
  .refine((v) => v.title !== undefined || v.pinned !== undefined || v.model !== undefined, {
    message: 'empty patch',
  });

interface ConversationRow {
  id: string;
  title: string;
  tool: string | null;
  model: string | null;
  pinned: number;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export function registerConversationRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/ai/conversations', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const parsed = listQuerySchema.safeParse(c.req.query());
    if (!parsed.success)
      return errorResponse('invalid_request', 'Bad query', 400, c.get('requestId'));
    const q = parsed.data.q?.trim();
    const limit = parsed.data.limit ?? 50;

    const rows = q
      ? await db
          .prepare(
            `SELECT c.* FROM conversations c
              WHERE c.user_id = ?
                AND (c.title LIKE ? ESCAPE '\\'
                     OR EXISTS (SELECT 1 FROM messages m
                                 WHERE m.conversation_id = c.id
                                   AND m.role = 'user'
                                   AND m.content LIKE ? ESCAPE '\\'))
              ORDER BY c.pinned DESC, c.updated_at DESC
              LIMIT ?`,
          )
          .bind(session.user.id, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, limit)
          .all<ConversationRow>()
      : await db
          .prepare(
            `SELECT * FROM conversations
              WHERE user_id = ?
              ORDER BY pinned DESC, updated_at DESC
              LIMIT ?`,
          )
          .bind(session.user.id, limit)
          .all<ConversationRow>();

    return c.json({ conversations: (rows.results ?? []) as unknown as ConversationRow[] });
  });

  app.get('/api/v1/ai/conversations/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const conversation = await db
      .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), session.user.id)
      .first<ConversationRow>();
    if (!conversation)
      return errorResponse('not_found', 'Conversation not found', 404, c.get('requestId'));

    const messages = await db
      .prepare(
        `SELECT id, role, content, model, input_tokens, output_tokens, sparks,
                finish_reason, error_code, request_id, created_at
           FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      )
      .bind(conversation.id)
      .all<Record<string, unknown>>();

    return c.json({
      conversation,
      messages: (messages.results ?? []) as unknown as Array<Record<string, unknown>>,
    });
  });

  app.patch('/api/v1/ai/conversations/:id', async (c) => {
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
      .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), session.user.id)
      .first<{ id: string }>();
    if (!existing)
      return errorResponse('not_found', 'Conversation not found', 404, c.get('requestId'));

    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const binds: unknown[] = [now];
    if (parsed.data.title !== undefined) {
      sets.push('title = ?');
      binds.push(parsed.data.title.trim());
    }
    if (parsed.data.pinned !== undefined) {
      sets.push('pinned = ?');
      binds.push(parsed.data.pinned ? 1 : 0);
    }
    if (parsed.data.model !== undefined) {
      sets.push('model = ?');
      binds.push(parsed.data.model);
    }
    binds.push(c.req.param('id'), session.user.id);
    const updated = await db
      .prepare(
        `UPDATE conversations SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      )
      .bind(...(binds as [string, string, string]))
      .first<ConversationRow>();
    return c.json({ conversation: updated });
  });

  app.delete('/api/v1/ai/conversations/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const id = c.req.param('id');
    const existing = await db
      .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .bind(id, session.user.id)
      .first<{ id: string }>();
    if (!existing)
      return errorResponse('not_found', 'Conversation not found', 404, c.get('requestId'));

    // Explicit message delete: works whether or not the runtime enforces FK cascade.
    await db.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(id).run();
    await db
      .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
      .bind(id, session.user.id)
      .run();
    return c.body(null, 204);
  });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}
