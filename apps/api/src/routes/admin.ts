/**
 * Admin API routes (Phase 6) — `/api/admin/*`.
 *
 * Authentication: the SEPARATE admin better-auth instance (`conai_admin` cookie,
 * `/api/admin-auth/*`) — a user-plane session can never reach these routes.
 * Authorization: every route carries an explicit `admin.*` permission check via
 * @conai/permissions, evaluated server-side on every request.
 *
 * Hard rules:
 *  - MFA (TOTP) is mandatory: all routes except /me, /me/confirm-mfa and /csrf
 *    return `mfa_required` until the admin has a verified second factor;
 *  - every mutation appends an immutable row to `admin_audit_log`;
 *  - list/reads are `Cache-Control: no-store`;
 *  - only Owner can grant/revoke Owner (GRANTABLE_ROLES in @conai/permissions).
 */

import type { Hono, Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  ADMIN_ROLES,
  adminCan,
  canGrantRole,
  effectiveAdminPermissions,
  isValidCustomAdminPermissions,
  type AdminPermission,
  type AdminRole,
} from '@conai/permissions';
import { SETTING_KEYS, type AdminAuditRow } from '@conai/database';
import type { AppEnv } from '../env';
import { getAdminAuth } from '../admin-auth';
import { SESSION_COOKIES, createCsrfCookie } from '@conai/auth';
import { errorResponse } from '../middleware/security';

export interface AdminContext {
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
  customPermissions: readonly AdminPermission[] | null;
  permissions: readonly AdminPermission[];
  mfaEnrolled: boolean;
  status: 'active' | 'locked';
}

interface GuardRow {
  user_id: string;
  role: string;
  custom_permissions: string | null;
  status: 'active' | 'locked';
  mfa_enrolled: number;
  email: string;
  name: string;
  banned: number;
  twoFactorEnabled: number;
}

function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Parse the JSON custom-permission override; invalid/empty falls back to the role set. */
function parseCustomPermissions(raw: string | null): readonly AdminPermission[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && isValidCustomAdminPermissions(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Client IP — Cloudflare provides CF-Connecting-IP; fall back to nothing. */
function clientIp(c: Context<AppEnv>): string | null {
  return c.req.header('cf-connecting-ip') ?? null;
}

async function writeAudit(
  c: Context<AppEnv>,
  entry: {
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const admin = c.get('admin');
  if (!admin) return;
  await c.env
    .DB!.prepare(
      `INSERT INTO admin_audit_log
       (id, actor_id, actor_name, action, target_type, target_id, metadata, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      admin.userId,
      admin.email,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      JSON.stringify(entry.metadata ?? {}),
      clientIp(c),
      new Date().toISOString(),
    )
    .run();
}

/**
 * Admin session guard — mounted on `/api/admin/*`. Resolves the admin instance
 * session, joins the roster row, and rejects banned/locked/unknown accounts.
 */
const adminGuard = createMiddleware<AppEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/admin/csrf') return next();
  if (!c.env.DB) {
    return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
  }

  const auth = getAdminAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (!session?.user?.id) {
    return errorResponse(
      'admin_session_required',
      'Admin sign-in required',
      401,
      c.get('requestId'),
    );
  }

  const row = await c.env.DB.prepare(
    `SELECT m.user_id, m.role, m.custom_permissions, m.status, m.mfa_enrolled,
            u.email, u.name, u.banned, u."twoFactorEnabled"
     FROM admin_members m
     JOIN "user" u ON u.id = m.user_id
     WHERE m.user_id = ?`,
  )
    .bind(session.user.id)
    .first<GuardRow>();

  if (!row || row.banned === 1) {
    return errorResponse('admin_access_required', 'Admin access required', 403, c.get('requestId'));
  }
  if (row.status === 'locked') {
    return errorResponse('admin_locked', 'Admin account is locked', 403, c.get('requestId'));
  }
  if (!isAdminRole(row.role)) {
    return errorResponse('admin_role_invalid', 'Invalid admin role', 500, c.get('requestId'));
  }

  const customPermissions = parseCustomPermissions(row.custom_permissions);

  const principal: AdminContext = {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    customPermissions,
    permissions: effectiveAdminPermissions({
      role: row.role,
      customRolePermissions: customPermissions,
    }),
    // Live column is the enforcement source (never our cached mirror).
    mfaEnrolled: row.twoFactorEnabled === 1,
    status: row.status,
  };
  c.set('admin', principal);
  return next();
});

/** Permission gate factory — 403 JSON when the admin lacks `permission`. */
function requirePerm(permission: AdminPermission) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const admin = c.get('admin');
    if (!admin || !adminCan(admin, permission)) {
      return errorResponse('forbidden', 'Insufficient admin permission', 403, c.get('requestId'));
    }
    return next();
  });
}

/**
 * MFA gate — every admin route except /csrf, /me and /me/confirm-mfa requires an
 * enrolled TOTP factor. Registered after adminGuard so `admin` is always present.
 */
const requireMfa = createMiddleware<AppEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/admin/csrf' || path === '/api/admin/me') return next();
  const admin = c.get('admin');
  if (!admin?.mfaEnrolled) {
    return errorResponse(
      'mfa_required',
      'Enroll an authenticator before continuing',
      403,
      c.get('requestId'),
    );
  }
  return next();
});

function parsePagination(url: URL): { limit: number; offset: number } {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '25') || 25));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0);
  return { limit, offset };
}

const noStore = (c: Context<AppEnv>) => c.header('Cache-Control', 'no-store');

export function registerAdminRoutes(app: Hono<AppEnv>): void {
  app.use('/api/admin/*', adminGuard);

  // ── CSRF mint for the admin SPA (double-submit, same conai_csrf cookie) ────
  app.get('/api/admin/csrf', (c) => {
    const secure = c.env.ENVIRONMENT === 'production';
    const cookies = c.req.header('cookie') ?? '';
    const existing = cookies
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${SESSION_COOKIES.csrf}=`));
    if (existing) {
      return c.json({ token: decodeURIComponent(existing.slice(SESSION_COOKIES.csrf.length + 1)) });
    }
    const minted = createCsrfCookie(secure);
    c.header('Set-Cookie', `${minted.name}=${minted.value}; ${minted.attributes}`);
    return c.json({ token: minted.value });
  });

  // ── Current admin ──────────────────────────────────────────────────────────
  app.get('/api/admin/me', (c) => {
    noStore(c);
    const admin = c.get('admin')!;
    return c.json({
      admin: {
        userId: admin.userId,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: admin.permissions,
        customPermissions: admin.customPermissions,
        mfaEnrolled: admin.mfaEnrolled,
        status: admin.status,
      },
    });
  });

  // Called by the SPA after the TOTP enrollment flow verifies successfully.
  app.post('/api/admin/me/confirm-mfa', async (c) => {
    const admin = c.get('admin')!;
    const factor = await c.env
      .DB!.prepare(`SELECT "verified" FROM "twoFactor" WHERE "userId" = ?`)
      .bind(admin.userId)
      .first<{ verified: number }>();
    if (!factor || factor.verified !== 1) {
      return errorResponse(
        'mfa_not_verified',
        'Verify an authenticator code first',
        400,
        c.get('requestId'),
      );
    }
    const now = new Date().toISOString();
    await c.env
      .DB!.prepare(`UPDATE admin_members SET mfa_enrolled = 1, updated_at = ? WHERE user_id = ?`)
      .bind(now, admin.userId)
      .run();
    await writeAudit(c, {
      action: 'admin.mfa.enabled',
      targetType: 'admin_member',
      targetId: admin.userId,
    });
    return c.json({ ok: true, mfaEnrolled: true });
  });

  // Everything below requires an enrolled second factor.
  app.use('/api/admin/*', requireMfa);

  // ── Dashboard counts (admin.dashboard.view) ────────────────────────────────
  app.get('/api/admin/dashboard', requirePerm('admin.dashboard.view'), async (c) => {
    noStore(c);
    const db = c.env.DB!;
    const [users, banned, teams, files, conversations, messages, sparks, admins, audit24h] =
      await Promise.all([
        db.prepare(`SELECT count(*) AS n FROM "user"`).first<{ n: number }>(),
        db.prepare(`SELECT count(*) AS n FROM "user" WHERE banned = 1`).first<{ n: number }>(),
        db.prepare(`SELECT count(*) AS n FROM teams`).first<{ n: number }>(),
        db.prepare(`SELECT count(*) AS n FROM files`).first<{ n: number }>(),
        db.prepare(`SELECT count(*) AS n FROM conversations`).first<{ n: number }>(),
        db.prepare(`SELECT count(*) AS n FROM messages`).first<{ n: number }>(),
        db
          .prepare(`SELECT COALESCE(sum(balance), 0) AS total FROM spark_wallets`)
          .first<{ total: number }>(),
        db.prepare(`SELECT count(*) AS n FROM admin_members`).first<{ n: number }>(),
        db
          .prepare(
            `SELECT count(*) AS n FROM admin_audit_log
             WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')`,
          )
          .first<{ n: number }>(),
      ]);
    return c.json({
      counts: {
        users: users?.n ?? 0,
        bannedUsers: banned?.n ?? 0,
        teams: teams?.n ?? 0,
        files: files?.n ?? 0,
        conversations: conversations?.n ?? 0,
        messages: messages?.n ?? 0,
        sparksInCirculation: sparks?.total ?? 0,
        admins: admins?.n ?? 0,
        auditEventsLast24h: audit24h?.n ?? 0,
      },
    });
  });

  // ── User management (admin.users.view / .manage) ───────────────────────────
  app.get('/api/admin/users', requirePerm('admin.users.view'), async (c) => {
    noStore(c);
    const db = c.env.DB!;
    const { limit, offset } = parsePagination(new URL(c.req.url));
    const q = (c.req.query('q') ?? '').trim();
    const like = `%${q}%`;
    const where = q ? `WHERE (u.email LIKE ? OR u.name LIKE ? OR u.username LIKE ?)` : '';
    const listStmt = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.username, u."emailVerified", u.banned,
                u."twoFactorEnabled", u."createdAt",
                p.display_name, p.plan_id, p.locale, w.balance,
                EXISTS(SELECT 1 FROM admin_members a WHERE a.user_id = u.id) AS is_admin
         FROM "user" u
         LEFT JOIN user_profiles p ON p.id = u.id
         LEFT JOIN spark_wallets w ON w.user_id = u.id
         ${where}
         ORDER BY u."createdAt" DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...(q ? [like, like, like, limit, offset] : [limit, offset]));
    const countStmt = db
      .prepare(`SELECT count(*) AS n FROM "user" u ${where}`)
      .bind(...(q ? [like, like, like] : []));
    const [rows, total] = await Promise.all([listStmt.all(), countStmt.first<{ n: number }>()]);

    return c.json({ users: rows.results ?? [], total: total?.n ?? 0, limit, offset });
  });

  app.get('/api/admin/users/:id', requirePerm('admin.users.view'), async (c) => {
    noStore(c);
    const db = c.env.DB!;
    const id = c.req.param('id');
    const user = await db
      .prepare(
        `SELECT u.id, u.email, u.name, u.username, u."emailVerified", u.banned,
                u."twoFactorEnabled", u."createdAt", u."updatedAt",
                p.display_name, p.plan_id, p.locale, p.referral_code,
                w.balance, w.updated_at AS wallet_updated_at
         FROM "user" u
         LEFT JOIN user_profiles p ON p.id = u.id
         LEFT JOIN spark_wallets w ON w.user_id = u.id
         WHERE u.id = ?`,
      )
      .bind(id)
      .first();
    if (!user) return errorResponse('not_found', 'User not found', 404, c.get('requestId'));

    const [teams, membership, recentAudit] = await Promise.all([
      db
        .prepare(
          `SELECT t.id, t.name, t.slug, tm.role
           FROM team_members tm JOIN teams t ON t.id = tm.team_id
           WHERE tm.user_id = ? ORDER BY t.name`,
        )
        .bind(id)
        .all(),
      db.prepare(`SELECT * FROM admin_members WHERE user_id = ?`).bind(id).first(),
      db
        .prepare(
          `SELECT id, action, target_type, created_at FROM admin_audit_log
           WHERE target_id = ? ORDER BY created_at DESC LIMIT 10`,
        )
        .bind(id)
        .all(),
    ]);
    return c.json({
      user,
      teams: teams.results ?? [],
      adminMembership: membership,
      relatedAudit: recentAudit.results ?? [],
    });
  });

  const lockSchema = z.object({ reason: z.string().max(500).optional() });

  app.post('/api/admin/users/:id/lock', requirePerm('admin.users.manage'), async (c) => {
    const parsed = lockSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse(
        'validation_error',
        parsed.error.issues[0]?.message ?? 'Invalid body',
        400,
        c.get('requestId'),
      );
    }
    const id = c.req.param('id');
    const target = await c.env
      .DB!.prepare(`SELECT id, email FROM "user" WHERE id = ?`)
      .bind(id)
      .first<{ id: string; email: string }>();
    if (!target) return errorResponse('not_found', 'User not found', 404, c.get('requestId'));
    if (id === c.get('admin')!.userId) {
      return errorResponse(
        'self_lock',
        'You cannot lock your own account',
        400,
        c.get('requestId'),
      );
    }
    await c.env
      .DB!.prepare(`UPDATE "user" SET banned = 1, "updatedAt" = ? WHERE id = ?`)
      .bind(new Date().toISOString(), id)
      .run();
    await writeAudit(c, {
      action: 'admin.user.lock',
      targetType: 'user',
      targetId: id,
      metadata: { email: target.email, reason: parsed.data.reason ?? null },
    });
    return c.json({ ok: true, banned: true });
  });

  app.post('/api/admin/users/:id/unlock', requirePerm('admin.users.manage'), async (c) => {
    const id = c.req.param('id');
    const target = await c.env
      .DB!.prepare(`SELECT id, email FROM "user" WHERE id = ?`)
      .bind(id)
      .first<{ id: string; email: string }>();
    if (!target) return errorResponse('not_found', 'User not found', 404, c.get('requestId'));
    await c.env
      .DB!.prepare(`UPDATE "user" SET banned = 0, "updatedAt" = ? WHERE id = ?`)
      .bind(new Date().toISOString(), id)
      .run();
    await writeAudit(c, {
      action: 'admin.user.unlock',
      targetType: 'user',
      targetId: id,
      metadata: { email: target.email },
    });
    return c.json({ ok: true, banned: false });
  });

  // ── Admin roster (admin.roles.manage) ──────────────────────────────────────
  app.get('/api/admin/admins', requirePerm('admin.roles.manage'), async (c) => {
    noStore(c);
    const rows = await c.env
      .DB!.prepare(
        `SELECT m.user_id, m.role, m.custom_permissions, m.status, m.mfa_enrolled,
              m.created_at, u.email, u.name, u."twoFactorEnabled"
       FROM admin_members m JOIN "user" u ON u.id = m.user_id
       ORDER BY m.created_at ASC`,
      )
      .all();
    return c.json({ admins: rows.results ?? [] });
  });

  const grantSchema = z.object({
    email: z.string().email().max(200),
    role: z.enum([...ADMIN_ROLES] as [AdminRole, ...AdminRole[]]),
    customPermissions: z.array(z.string()).optional(),
  });

  app.post('/api/admin/admins', requirePerm('admin.roles.manage'), async (c) => {
    const actor = c.get('admin')!;
    const parsed = grantSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse(
        'validation_error',
        parsed.error.issues[0]?.message ?? 'Invalid body',
        400,
        c.get('requestId'),
      );
    }
    const { email, role } = parsed.data;
    if (!canGrantRole(actor.role, role)) {
      return errorResponse(
        'forbidden',
        `Your role cannot grant '${role}'`,
        403,
        c.get('requestId'),
      );
    }
    let customPermissions: readonly AdminPermission[] | null = null;
    if (parsed.data.customPermissions !== undefined) {
      if (!isValidCustomAdminPermissions(parsed.data.customPermissions)) {
        return errorResponse(
          'validation_error',
          'Invalid custom permission list',
          400,
          c.get('requestId'),
        );
      }
      customPermissions = parsed.data.customPermissions;
    }

    const target = await c.env
      .DB!.prepare(`SELECT id, email FROM "user" WHERE lower(email) = lower(?)`)
      .bind(email.trim())
      .first<{ id: string; email: string }>();
    if (!target)
      return errorResponse('not_found', 'No user with that email', 404, c.get('requestId'));

    const now = new Date().toISOString();
    await c.env
      .DB!.prepare(
        `INSERT INTO admin_members
         (user_id, role, custom_permissions, status, mfa_enrolled, created_at, updated_at, created_by)
       VALUES (?, ?, ?, 'active',
         (SELECT "twoFactorEnabled" FROM "user" WHERE id = ?), ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         role = excluded.role,
         custom_permissions = excluded.custom_permissions,
         status = 'active',
         updated_at = excluded.updated_at`,
      )
      .bind(
        target.id,
        role,
        customPermissions ? JSON.stringify(customPermissions) : null,
        target.id,
        now,
        now,
        actor.userId,
      )
      .run();
    await writeAudit(c, {
      action: 'admin.role.grant',
      targetType: 'admin_member',
      targetId: target.id,
      metadata: { email: target.email, role, customPermissions },
    });
    return c.json({ ok: true, userId: target.id, role });
  });

  app.delete('/api/admin/admins/:userId', requirePerm('admin.roles.manage'), async (c) => {
    const actor = c.get('admin')!;
    const targetId = c.req.param('userId');
    if (targetId === actor.userId) {
      return errorResponse(
        'self_revoke',
        'You cannot remove your own admin access',
        400,
        c.get('requestId'),
      );
    }
    const target = await c.env
      .DB!.prepare(`SELECT user_id, role FROM admin_members WHERE user_id = ?`)
      .bind(targetId)
      .first<{ user_id: string; role: string }>();
    if (!target) return errorResponse('not_found', 'Admin not found', 404, c.get('requestId'));

    if (target.role === 'owner') {
      if (!adminCan(actor, 'admin.grant_owner')) {
        return errorResponse(
          'forbidden',
          'Only an Owner can revoke an Owner',
          403,
          c.get('requestId'),
        );
      }
      const owners = await c.env
        .DB!.prepare(
          `SELECT count(*) AS n FROM admin_members WHERE role = 'owner' AND status = 'active'`,
        )
        .first<{ n: number }>();
      if ((owners?.n ?? 0) <= 1) {
        return errorResponse(
          'last_owner',
          'Cannot remove the last active Owner',
          409,
          c.get('requestId'),
        );
      }
    }
    await c.env.DB!.prepare(`DELETE FROM admin_members WHERE user_id = ?`).bind(targetId).run();
    await writeAudit(c, {
      action: 'admin.role.revoke',
      targetType: 'admin_member',
      targetId: targetId,
      metadata: { role: target.role },
    });
    return c.json({ ok: true });
  });

  // ── Audit log (admin.audit.view) ───────────────────────────────────────────
  app.get('/api/admin/audit', requirePerm('admin.audit.view'), async (c) => {
    noStore(c);
    const { limit, offset } = parsePagination(new URL(c.req.url));
    const action = (c.req.query('action') ?? '').trim();
    const rows = await c.env
      .DB!.prepare(
        `SELECT id, actor_id, actor_name, action, target_type, target_id,
              metadata, ip_address, created_at
       FROM admin_audit_log
       WHERE (?1 = '' OR action = ?1)
       ORDER BY created_at DESC
       LIMIT ?2 OFFSET ?3`,
      )
      .bind(action, limit, offset)
      .all<AdminAuditRow>();
    const total = await c.env
      .DB!.prepare(`SELECT count(*) AS n FROM admin_audit_log WHERE (?1 = '' OR action = ?1)`)
      .bind(action)
      .first<{ n: number }>();
    return c.json({ events: rows.results ?? [], total: total?.n ?? 0, limit, offset });
  });

  // ── Platform settings (admin.settings.manage) ──────────────────────────────
  const settingKeys = Object.values(SETTING_KEYS);

  app.get('/api/admin/settings', requirePerm('admin.settings.manage'), async (c) => {
    noStore(c);
    const rows = await c.env
      .DB!.prepare(
        `SELECT key, value, updated_at, updated_by
       FROM platform_settings WHERE key IN (${settingKeys.map(() => '?').join(',')})
       ORDER BY key`,
      )
      .bind(...settingKeys)
      .all();
    return c.json({ settings: rows.results ?? [], editableKeys: settingKeys });
  });

  const settingsSchema = z.object({
    key: z.string().min(1).max(100),
    value: z.record(z.string(), z.unknown()),
  });

  app.put('/api/admin/settings', requirePerm('admin.settings.manage'), async (c) => {
    const parsed = settingsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse(
        'validation_error',
        parsed.error.issues[0]?.message ?? 'Invalid body',
        400,
        c.get('requestId'),
      );
    }
    const { key, value } = parsed.data;
    if (!settingKeys.includes(key as (typeof settingKeys)[number])) {
      return errorResponse(
        'validation_error',
        `Setting '${key}' is not editable`,
        400,
        c.get('requestId'),
      );
    }
    const encoded = JSON.stringify(value);
    await c.env
      .DB!.prepare(
        `INSERT INTO platform_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      .bind(key, encoded, new Date().toISOString(), c.get('admin')!.userId)
      .run();
    await writeAudit(c, {
      action: 'admin.settings.update',
      targetType: 'platform_setting',
      targetId: key,
      metadata: { value },
    });
    return c.json({ ok: true, key, value });
  });
}
