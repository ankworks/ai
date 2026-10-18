/**
 * Personal Library file routes (Phase 4, ARCHITECTURE §11):
 *   POST   /api/v1/files/presign  — validate size/quota → pending row + presigned PUT
 *   GET    /api/v1/files          — own files (stale unconfirmed rows cleaned inline)
 *   POST   /api/v1/files/:id/confirm — HEAD object server-side → mark stored
 *   GET    /api/v1/files/:id      — short-lived presigned GET (download/preview)
 *   DELETE /api/v1/files/:id      — signed DELETE to B2, then drop metadata
 *
 * File BYTES never pass through the Worker (client ↔ B2 presigned).
 * Requires B2_APP_KEY_ID / B2_APP_KEY / B2_BUCKET_REGION — without them every
 * route answers 503 not_configured (honest: never a fake upload).
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import {
  BUCKETS,
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  canUpload,
  presignUrl,
  signRequest,
  type AwsCredentials,
} from '@conai/storage';
import type { AppEnv, Env } from '../env';
import { errorResponse } from '../middleware/security';
import { requireSession } from './me';
import { loadUploadLimits } from '../ai/system-prompt';

interface FileRow {
  id: string;
  owner_id: string;
  scope: string;
  kind: 'image' | 'document';
  filename: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  status: 'pending' | 'stored';
  created_at: string;
  stored_at: string | null;
}

/** Pending uploads never confirmed are forgotten after this window. */
const PENDING_TTL_MS = 60 * 60 * 1000;
const PUT_EXPIRES_SEC = 900;
const GET_EXPIRES_SEC = 600;

function b2(env: Env): { credentials: AwsCredentials; endpoint: string } | null {
  const keyId = env.B2_APP_KEY_ID;
  const key = env.B2_APP_KEY;
  const region = env.B2_BUCKET_REGION;
  if (!keyId || !key || !region) return null;
  return {
    credentials: { accessKeyId: keyId, secretAccessKey: key, region },
    endpoint: `https://s3.${region}.backblazeb2.com`,
  };
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base
    .replace(/[^\w.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[.-_]+/, '');
  return (cleaned || 'file').slice(0, 80);
}

function kindOf(filename: string): 'image' | 'document' | null {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'image';
  if ((DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) return 'document';
  return null;
}

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(1),
  mimeType: z.string().min(3).max(150),
});

export function registerFileRoutes(app: Hono<AppEnv>): void {
  // Upload policy for clients (limits come from settings — never hardcoded UI).
  app.get('/api/v1/files/limits', async (c) => {
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const limits = await loadUploadLimits(db);
    const b2c = b2(c.env);
    return c.json({
      storageConfigured: !!b2c,
      limits,
      extensions: {
        image: IMAGE_EXTENSIONS,
        document: DOCUMENT_EXTENSIONS,
      },
    });
  });

  app.post('/api/v1/files/presign', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const b2c = b2(c.env);
    if (!b2c) {
      return errorResponse(
        'not_configured',
        'Object storage is not configured on this deployment (B2 keys missing)',
        503,
        c.get('requestId'),
      );
    }

    const body = await c.req.json().catch(() => null);
    const parsed = presignSchema.safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Invalid file request', 400, c.get('requestId'));

    const filename = sanitizeFilename(parsed.data.filename);
    const kind = kindOf(filename);
    if (!kind) {
      return errorResponse(
        'unsupported_file',
        `Unsupported file type — allowed: ${(IMAGE_EXTENSIONS as readonly string[]).concat(DOCUMENT_EXTENSIONS).join(', ')}`,
        400,
        c.get('requestId'),
      );
    }

    const limits = await loadUploadLimits(db);
    const maxMb = kind === 'image' ? limits.maxImageMb : limits.maxDocumentMb;
    if (parsed.data.sizeBytes > maxMb * 1024 * 1024) {
      return errorResponse(
        'file_too_large',
        `Max ${maxMb} MB for ${kind} files`,
        413,
        c.get('requestId'),
      );
    }

    // Byte quota from the user's plan (personal_storage_mb).
    const plan = await db
      .prepare(
        `SELECT p.personal_storage_mb FROM user_profiles up
           JOIN plan_configs p ON p.id = up.plan_id
          WHERE up.id = ?`,
      )
      .bind(session.user.id)
      .first<{ personal_storage_mb: number | null }>();
    const usedRow = await db
      .prepare(
        "SELECT COALESCE(SUM(size_bytes), 0) AS used FROM files WHERE owner_id = ? AND status = 'stored'",
      )
      .bind(session.user.id)
      .first<{ used: number }>();
    const limitMb = plan?.personal_storage_mb;
    if (limitMb !== null && limitMb !== undefined) {
      const ok = canUpload(
        { limitBytes: limitMb * 1024 * 1024, usedBytes: usedRow?.used ?? 0 },
        parsed.data.sizeBytes,
      );
      if (!ok) {
        return errorResponse(
          'quota_exceeded',
          `Storage quota exceeded (${limitMb} MB plan limit)`,
          400,
          c.get('requestId'),
        );
      }
    }

    const storageKey = `${session.user.id}/${crypto.randomUUID()}/${filename}`;
    const now = new Date().toISOString();
    const row = await db
      .prepare(
        `INSERT INTO files (id, owner_id, scope, team_id, kind, filename, storage_key, mime_type,
                            size_bytes, page_count, status, created_at, stored_at)
         VALUES (?, ?, 'personal', NULL, ?, ?, ?, ?, ?, NULL, 'pending', ?, NULL)
         RETURNING *`,
      )
      .bind(
        crypto.randomUUID(),
        session.user.id,
        kind,
        filename,
        storageKey,
        parsed.data.mimeType,
        parsed.data.sizeBytes,
        now,
      )
      .first<FileRow>();
    if (!row)
      return errorResponse('internal_error', 'Could not create file row', 500, c.get('requestId'));

    const uploadUrl = await presignUrl({
      method: 'PUT',
      url: `${b2c.endpoint}/${BUCKETS.personal}/${storageKey}`,
      credentials: b2c.credentials,
      expiresIn: PUT_EXPIRES_SEC,
    });
    return c.json({ file: row, uploadUrl, method: 'PUT', expiresIn: PUT_EXPIRES_SEC }, 201);
  });

  app.get('/api/v1/files', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    // Forget uploads that were never confirmed (do not count against quota).
    await db
      .prepare('DELETE FROM files WHERE owner_id = ? AND status = ? AND created_at < ?')
      .bind(session.user.id, 'pending', new Date(Date.now() - PENDING_TTL_MS).toISOString())
      .run();

    const rows = await db
      .prepare('SELECT * FROM files WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200')
      .bind(session.user.id)
      .all<FileRow>();
    const files = (rows.results ?? []) as unknown as FileRow[];
    const used = files.filter((f) => f.status === 'stored').reduce((s, f) => s + f.size_bytes, 0);
    const plan = await db
      .prepare(
        `SELECT p.personal_storage_mb FROM user_profiles up
           JOIN plan_configs p ON p.id = up.plan_id
          WHERE up.id = ?`,
      )
      .bind(session.user.id)
      .first<{ personal_storage_mb: number | null }>();
    return c.json({
      files,
      usage: {
        usedBytes: used,
        limitBytes:
          plan?.personal_storage_mb != null ? plan.personal_storage_mb * 1024 * 1024 : null,
      },
    });
  });

  app.post('/api/v1/files/:id/confirm', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const b2c = b2(c.env);
    if (!b2c)
      return errorResponse(
        'not_configured',
        'Object storage is not configured',
        503,
        c.get('requestId'),
      );

    const file = await db
      .prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?')
      .bind(c.req.param('id'), session.user.id)
      .first<FileRow>();
    if (!file) return errorResponse('not_found', 'File not found', 404, c.get('requestId'));
    if (file.status === 'stored') return c.json({ file });

    const url = `${b2c.endpoint}/${BUCKETS.personal}/${file.storage_key}`;
    const { host: _host, ...sendHeaders } = await signRequest({
      method: 'HEAD',
      url,
      credentials: b2c.credentials,
    });
    const res = await fetch(url, { method: 'HEAD', headers: sendHeaders });
    if (res.status === 404) {
      await db.prepare('DELETE FROM files WHERE id = ?').bind(file.id).run();
      return errorResponse(
        'gone',
        'Upload not found on storage — create a new presign',
        410,
        c.get('requestId'),
      );
    }
    if (!res.ok) {
      return errorResponse(
        'storage_error',
        `Storage HEAD failed (${res.status})`,
        502,
        c.get('requestId'),
      );
    }
    const stored = await db
      .prepare("UPDATE files SET status = 'stored', stored_at = ? WHERE id = ? RETURNING *")
      .bind(new Date().toISOString(), file.id)
      .first<FileRow>();
    return c.json({ file: stored });
  });

  app.get('/api/v1/files/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const b2c = b2(c.env);
    if (!b2c)
      return errorResponse(
        'not_configured',
        'Object storage is not configured',
        503,
        c.get('requestId'),
      );

    const file = await db
      .prepare("SELECT * FROM files WHERE id = ? AND owner_id = ? AND status = 'stored'")
      .bind(c.req.param('id'), session.user.id)
      .first<FileRow>();
    if (!file)
      return errorResponse(
        'not_found',
        'File not found or not uploaded yet',
        404,
        c.get('requestId'),
      );

    const downloadUrl = await presignUrl({
      method: 'GET',
      url: `${b2c.endpoint}/${BUCKETS.personal}/${file.storage_key}`,
      credentials: b2c.credentials,
      expiresIn: GET_EXPIRES_SEC,
    });
    return c.json({ downloadUrl, expiresIn: GET_EXPIRES_SEC });
  });

  app.delete('/api/v1/files/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const b2c = b2(c.env);
    if (!b2c)
      return errorResponse(
        'not_configured',
        'Object storage is not configured',
        503,
        c.get('requestId'),
      );

    const file = await db
      .prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?')
      .bind(c.req.param('id'), session.user.id)
      .first<FileRow>();
    if (!file) return errorResponse('not_found', 'File not found', 404, c.get('requestId'));

    // Remove the object first (missing object is fine), then the metadata row.
    const url = `${b2c.endpoint}/${BUCKETS.personal}/${file.storage_key}`;
    const { host: _host, ...sendHeaders } = await signRequest({
      method: 'DELETE',
      url,
      credentials: b2c.credentials,
    });
    const res = await fetch(url, { method: 'DELETE', headers: sendHeaders });
    if (!res.ok && res.status !== 404) {
      return errorResponse(
        'storage_error',
        `Storage DELETE failed (${res.status})`,
        502,
        c.get('requestId'),
      );
    }
    await db.prepare('DELETE FROM files WHERE id = ?').bind(file.id).run();
    return c.body(null, 204);
  });
}
