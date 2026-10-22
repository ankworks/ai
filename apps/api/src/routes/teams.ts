/**
 * Teams routes (Phase 5, ARCHITECTURE §12 / PRODUCT_SPEC §12):
 *   GET    /api/v1/teams                       — teams I belong to
 *   POST   /api/v1/teams                       — create (plan entitlement)
 *   GET    /api/v1/teams/:id                   — detail (members only)
 *   PATCH  /api/v1/teams/:id                   — rename        (team.settings.manage)
 *   DELETE /api/v1/teams/:id                   — delete team   (owner only)
 *   GET    /api/v1/teams/:id/members           — roster        (team.view)
 *   PATCH  /api/v1/teams/:id/members/:userId   — role/custom   (team.roles.manage)
 *   DELETE /api/v1/teams/:id/members/:userId   — remove/leave  (team.members.remove)
 *   POST   /api/v1/teams/:id/transfer          — ownership     (owner only)
 *   POST   /api/v1/teams/:id/invites           — invite        (team.members.invite)
 *   GET    /api/v1/teams/:id/invites           — pending       (team.members.invite)
 *   DELETE /api/v1/teams/:id/invites/:token    — revoke        (team.members.invite)
 *   POST   /api/v1/teams/:id/invites/:token/accept — self      (authenticated)
 *   GET    /api/v1/teams/:id/roles             — custom roles  (team.view)
 *   POST   /api/v1/teams/:id/roles             — create        (team.roles.manage)
 *   PATCH  /api/v1/teams/:id/roles/:roleId     — update        (team.roles.manage)
 *   DELETE /api/v1/teams/:id/roles/:roleId     — delete        (team.roles.manage)
 *   GET    /api/v1/teams/:id/modules           — toggles       (team.view)
 *   PUT    /api/v1/teams/:id/modules           — set           (team.modules.manage)
 *   GET    /api/v1/teams/:id/activity          — 30-day log    (activity.view)
 *
 * Every mutation is authorized server-side with @conai/permissions —
 * built-in role sets or an exact custom-role permission list.
 * AI inside teams always spends the CALLING user's Sparks (no wallet writes here).
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import { createEmailSender } from '@conai/auth';
import {
  TEAM_MODULES,
  type TeamActivityRow,
  type TeamInviteRow,
  type TeamMemberRow,
  type TeamRoleRow,
  type TeamRow,
} from '@conai/database';
import {
  TEAM_PERMISSIONS,
  effectiveTeamPermissions,
  teamCan,
  type TeamPermission,
  type TeamPrincipal,
} from '@conai/permissions';
import type { AppEnv, Env } from '../env';
import { errorResponse } from '../middleware/security';
import { requireSession } from './me';

/** Owner-only permissions — never grantable to custom roles. */
const OWNER_ONLY: readonly TeamPermission[] = ['team.transfer_ownership', 'team.delete'];

const INVITE_TTL_DAYS = 7;
const ACTIVITY_RETENTION_DAYS = 30;

interface Principal extends TeamPrincipal {
  member: TeamMemberRow;
  /** Effective permission list (custom role overrides built-in). */
  permissions: readonly TeamPermission[];
}

/** Load the caller's membership + effective permissions, or null. */
async function loadPrincipal(
  db: NonNullable<Env['DB']>,
  teamId: string,
  userId: string,
): Promise<Principal | null> {
  const row = await db
    .prepare(
      `SELECT m.team_id, m.user_id, m.role, m.custom_role_id, m.joined_at,
              r.permissions AS custom_permissions
         FROM team_members m
         LEFT JOIN team_roles r ON r.id = m.custom_role_id
        WHERE m.team_id = ? AND m.user_id = ?`,
    )
    .bind(teamId, userId)
    .first<{
      team_id: string;
      user_id: string;
      role: TeamMemberRow['role'];
      custom_role_id: string | null;
      joined_at: string;
      custom_permissions: string | null;
    }>();
  if (!row) return null;
  const customRolePermissions = row.custom_permissions
    ? (JSON.parse(row.custom_permissions) as TeamPermission[])
    : null;
  return {
    member: {
      team_id: row.team_id,
      user_id: row.user_id,
      role: row.role,
      custom_role_id: row.custom_role_id,
      joined_at: row.joined_at,
    },
    role: row.role,
    customRolePermissions,
    permissions: effectiveTeamPermissions({ role: row.role, customRolePermissions }),
  };
}

function requirePermission(
  principal: Principal,
  permission: TeamPermission,
  requestId: string,
): { ok: true } | { ok: false; res: Response } {
  if (teamCan(principal, permission)) return { ok: true };
  return {
    ok: false,
    res: errorResponse('forbidden', 'Insufficient team permissions', 403, requestId),
  };
}

/** ISO now, reused across one request so rows stay consistent. */
function nowIso(): string {
  return new Date().toISOString();
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'team';
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function memberCount(db: NonNullable<Env['DB']>, teamId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?')
    .bind(teamId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function logActivity(
  db: NonNullable<Env['DB']>,
  teamId: string,
  actorId: string,
  type: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO team_activity (id, team_id, actor_id, type, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), teamId, actorId, type, JSON.stringify(meta), nowIso())
    .run();
}

/** 30-day retention sweep (PRODUCT_SPEC §18) — runs on every read/write. */
async function sweepActivity(db: NonNullable<Env['DB']>, teamId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 86_400_000).toISOString();
  await db
    .prepare('DELETE FROM team_activity WHERE team_id = ? AND created_at < ?')
    .bind(teamId, cutoff)
    .run();
}

function modulesOf(team: Pick<TeamRow, 'modules'>): Record<string, boolean> {
  const stored = parseJson<Record<string, boolean>>(team.modules, {});
  const merged: Record<string, boolean> = {};
  for (const id of TEAM_MODULES) merged[id] = stored[id] === false ? false : true;
  return merged;
}

export function registerTeamRoutes(app: Hono<AppEnv>): void {
  // ── List my teams ──────────────────────────────────────────────
  app.get('/api/v1/teams', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const rows = await db
      .prepare(
        `SELECT t.*, m.role,
                (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
           FROM teams t
           JOIN team_members m ON m.team_id = t.id AND m.user_id = ?
          ORDER BY t.created_at DESC`,
      )
      .bind(session.user.id)
      .all<TeamRow & { role: TeamMemberRow['role']; member_count: number }>();

    return c.json({
      teams: (rows.results ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        ownerId: t.owner_id,
        modules: modulesOf(t),
        memberCount: t.member_count,
        role: t.role,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  });

  // ── Create a team (plan entitlement: max_teams_per_account) ────
  app.post('/api/v1/teams', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const body = await c.req.json().catch(() => null);
    const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(body);
    if (!parsed.success)
      return errorResponse(
        'invalid_request',
        'Team name required (1–60 chars)',
        400,
        c.get('requestId'),
      );
    const name = parsed.data.name;

    const plan = await db
      .prepare(
        `SELECT pc.max_teams_per_account, pc.max_team_members
           FROM user_profiles up
           JOIN plan_configs pc ON pc.id = up.plan_id
          WHERE up.id = ?`,
      )
      .bind(session.user.id)
      .first<{ max_teams_per_account: number | null; max_team_members: number | null }>();
    const maxTeams = plan?.max_teams_per_account ?? 0;
    if (maxTeams <= 0)
      return errorResponse(
        'plan_not_entitled',
        'Your plan does not include Teams — switch to the Teams plan',
        403,
        c.get('requestId'),
      );

    const owned = await db
      .prepare('SELECT COUNT(*) AS n FROM teams WHERE owner_id = ?')
      .bind(session.user.id)
      .first<{ n: number }>();
    if ((owned?.n ?? 0) >= maxTeams)
      return errorResponse(
        'team_limit_reached',
        `Plan limit reached (${maxTeams} teams per account)`,
        403,
        c.get('requestId'),
      );

    const id = crypto.randomUUID();
    const slug = slugify(name);
    // UNIQUE slug — retry once with a short suffix before giving up.
    try {
      await db
        .prepare(
          'INSERT INTO teams (id, name, slug, owner_id, modules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(id, name, slug, session.user.id, '{}', nowIso(), nowIso())
        .run();
    } catch {
      try {
        await db
          .prepare(
            'INSERT INTO teams (id, name, slug, owner_id, modules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            id,
            name,
            `${slug}-${crypto.randomUUID().slice(0, 4)}`,
            session.user.id,
            '{}',
            nowIso(),
            nowIso(),
          )
          .run();
      } catch {
        return errorResponse(
          'slug_conflict',
          'Could not allocate a unique team slug',
          409,
          c.get('requestId'),
        );
      }
    }

    await db.batch([
      db
        .prepare(
          'INSERT INTO team_members (team_id, user_id, role, custom_role_id, joined_at) VALUES (?, ?, ?, NULL, ?)',
        )
        .bind(id, session.user.id, 'owner', nowIso()),
      db
        .prepare(
          'INSERT INTO team_activity (id, team_id, actor_id, type, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(crypto.randomUUID(), id, session.user.id, 'team.created', '{}', nowIso()),
    ]);

    return c.json({ team: { id, name, slug, ownerId: session.user.id } }, 201);
  });

  // ── Team-scoped routes (membership + permission gated) ────────
  app.get('/api/v1/teams/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));

    const team = await db
      .prepare('SELECT * FROM teams WHERE id = ?')
      .bind(c.req.param('id'))
      .first<TeamRow>();
    if (!team) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));

    return c.json({
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        ownerId: team.owner_id,
        modules: modulesOf(team),
        memberCount: await memberCount(db, team.id),
        myRole: principal.member.role,
        myPermissions: principal.permissions,
        createdAt: team.created_at,
        updatedAt: team.updated_at,
      },
    });
  });

  app.patch('/api/v1/teams/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.settings.manage', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const body = await c.req.json().catch(() => null);
    const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(body);
    if (!parsed.success)
      return errorResponse(
        'invalid_request',
        'Team name required (1–60 chars)',
        400,
        c.get('requestId'),
      );

    await db
      .prepare('UPDATE teams SET name = ?, updated_at = ? WHERE id = ?')
      .bind(parsed.data.name, nowIso(), principal.member.team_id)
      .run();
    await logActivity(db, principal.member.team_id, session.user.id, 'team.updated', {
      name: parsed.data.name,
    });
    return c.json({ ok: true });
  });

  app.delete('/api/v1/teams/:id', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    if (principal.member.role !== 'owner')
      return errorResponse(
        'forbidden',
        'Only the team owner can delete the team',
        403,
        c.get('requestId'),
      );

    const teamId = principal.member.team_id;
    // Metadata rows for team-scoped files are dropped with the team; the
    // B2 objects they referenced are cleaned up by the storage lifecycle
    // sweep (Phase 8 hardening) — bytes never transit the Worker.
    await db.batch([
      db.prepare('DELETE FROM team_activity WHERE team_id = ?').bind(teamId),
      db.prepare('DELETE FROM team_invites WHERE team_id = ?').bind(teamId),
      db.prepare('DELETE FROM team_members WHERE team_id = ?').bind(teamId),
      db.prepare('DELETE FROM team_roles WHERE team_id = ?').bind(teamId),
      db.prepare("DELETE FROM files WHERE team_id = ? AND scope = 'team'").bind(teamId),
      db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId),
    ]);
    return c.json({ ok: true });
  });

  // ── Members ────────────────────────────────────────────────────
  app.get('/api/v1/teams/:id/members', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.view', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const rows = await db
      .prepare(
        `SELECT m.team_id, m.user_id, m.role, m.custom_role_id, m.joined_at,
                r.name AS custom_role_name, up.username, up.display_name
           FROM team_members m
           JOIN user_profiles up ON up.id = m.user_id
           LEFT JOIN team_roles r ON r.id = m.custom_role_id
          WHERE m.team_id = ?
          ORDER BY (m.role = 'owner') DESC, m.joined_at ASC`,
      )
      .bind(principal.member.team_id)
      .all<
        TeamMemberRow & {
          custom_role_name: string | null;
          username: string;
          display_name: string;
        }
      >();

    return c.json({
      members: (rows.results ?? []).map((m) => ({
        userId: m.user_id,
        role: m.role,
        customRoleId: m.custom_role_id,
        customRoleName: m.custom_role_name,
        username: m.username,
        displayName: m.display_name,
        joinedAt: m.joined_at,
      })),
    });
  });

  app.patch('/api/v1/teams/:id/members/:userId', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.roles.manage', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        role: z.enum(['admin', 'member', 'viewer']).optional(),
        customRoleId: z.string().uuid().nullable().optional(),
      })
      .refine((v) => v.role !== undefined || v.customRoleId !== undefined, {
        message: 'empty patch',
      })
      .safeParse(body);
    if (!parsed.success)
      return errorResponse(
        'invalid_request',
        'Provide role and/or customRoleId',
        400,
        c.get('requestId'),
      );

    const teamId = principal.member.team_id;
    const targetId = c.req.param('userId');
    if (targetId === session.user.id)
      return errorResponse('forbidden', 'You cannot change your own role', 403, c.get('requestId'));

    const target = await db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
      .bind(teamId, targetId)
      .first<TeamMemberRow>();
    if (!target) return errorResponse('not_found', 'Member not found', 404, c.get('requestId'));
    if (target.role === 'owner')
      return errorResponse(
        'forbidden',
        "The owner's role cannot be changed",
        403,
        c.get('requestId'),
      );

    let customRoleId = target.custom_role_id;
    if (parsed.data.customRoleId !== undefined) {
      if (parsed.data.customRoleId !== null) {
        const role = await db
          .prepare('SELECT id FROM team_roles WHERE id = ? AND team_id = ?')
          .bind(parsed.data.customRoleId, teamId)
          .first<{ id: string }>();
        if (!role)
          return errorResponse(
            'not_found',
            'Custom role not found in this team',
            404,
            c.get('requestId'),
          );
      }
      customRoleId = parsed.data.customRoleId;
    }

    const role = parsed.data.role ?? target.role;
    await db
      .prepare(
        'UPDATE team_members SET role = ?, custom_role_id = ? WHERE team_id = ? AND user_id = ?',
      )
      .bind(role, customRoleId, teamId, targetId)
      .run();
    await logActivity(db, teamId, session.user.id, 'member.role_changed', {
      userId: targetId,
      role,
      customRoleId,
    });
    return c.json({ ok: true });
  });

  app.delete('/api/v1/teams/:id/members/:userId', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));

    const teamId = principal.member.team_id;
    const targetId = c.req.param('userId');
    const isSelf = targetId === session.user.id;

    if (isSelf) {
      if (principal.member.role === 'owner')
        return errorResponse(
          'forbidden',
          'Transfer ownership or delete the team before leaving',
          403,
          c.get('requestId'),
        );
    } else {
      const gate = requirePermission(principal, 'team.members.remove', c.get('requestId'));
      if (!gate.ok) return gate.res;
    }

    const target = await db
      .prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?')
      .bind(teamId, targetId)
      .first<{ role: TeamMemberRow['role'] }>();
    if (!target) return errorResponse('not_found', 'Member not found', 404, c.get('requestId'));
    if (target.role === 'owner')
      return errorResponse('forbidden', 'The owner cannot be removed', 403, c.get('requestId'));

    await db
      .prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')
      .bind(teamId, targetId)
      .run();
    await logActivity(db, teamId, session.user.id, 'member.removed', {
      userId: targetId,
      self: isSelf,
    });
    return c.json({ ok: true });
  });

  app.post('/api/v1/teams/:id/transfer', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    if (principal.member.role !== 'owner')
      return errorResponse(
        'forbidden',
        'Only the owner can transfer ownership',
        403,
        c.get('requestId'),
      );

    const body = await c.req.json().catch(() => null);
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Target userId required', 400, c.get('requestId'));
    if (parsed.data.userId === session.user.id)
      return errorResponse('invalid_request', 'You already own this team', 400, c.get('requestId'));

    const teamId = principal.member.team_id;
    const target = await db
      .prepare('SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?')
      .bind(teamId, parsed.data.userId)
      .first<{ user_id: string }>();
    if (!target)
      return errorResponse(
        'not_found',
        'Target is not a member of this team',
        404,
        c.get('requestId'),
      );

    await db.batch([
      db
        .prepare(
          "UPDATE team_members SET role = 'admin', custom_role_id = NULL WHERE team_id = ? AND user_id = ?",
        )
        .bind(teamId, session.user.id),
      db
        .prepare(
          "UPDATE team_members SET role = 'owner', custom_role_id = NULL WHERE team_id = ? AND user_id = ?",
        )
        .bind(teamId, parsed.data.userId),
      db
        .prepare('UPDATE teams SET owner_id = ?, updated_at = ? WHERE id = ?')
        .bind(parsed.data.userId, nowIso(), teamId),
      db
        .prepare(
          'INSERT INTO team_activity (id, team_id, actor_id, type, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          teamId,
          session.user.id,
          'ownership.transferred',
          JSON.stringify({ userId: parsed.data.userId }),
          nowIso(),
        ),
    ]);
    return c.json({ ok: true });
  });

  // ── Invites (link / email / @username) ─────────────────────────
  const inviteSchema = z
    .object({
      mode: z.enum(['link', 'email', 'username']),
      email: z.string().email().optional(),
      username: z.string().min(1).max(30).optional(),
      role: z.enum(['admin', 'member', 'viewer']).default('member'),
    })
    .refine(
      (v) =>
        (v.mode === 'link' && v.email === undefined && v.username === undefined) ||
        (v.mode === 'email' && typeof v.email === 'string' && v.username === undefined) ||
        (v.mode === 'username' && typeof v.username === 'string' && v.email === undefined),
      { message: 'invite target must match mode' },
    );

  app.post('/api/v1/teams/:id/invites', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.members.invite', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const body = await c.req.json().catch(() => null);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Invalid invite payload', 400, c.get('requestId'));
    const invite = parsed.data;
    const teamId = principal.member.team_id;

    // Capacity: plan's max_team_members (team owner's plan governs the team).
    const ownerPlan = await db
      .prepare(
        `SELECT pc.max_team_members FROM teams t
           JOIN user_profiles up ON up.id = t.owner_id
           JOIN plan_configs pc ON pc.id = up.plan_id
          WHERE t.id = ?`,
      )
      .bind(teamId)
      .first<{ max_team_members: number | null }>();
    const maxMembers = ownerPlan?.max_team_members ?? 0;
    if (maxMembers <= 0 || (await memberCount(db, teamId)) >= maxMembers)
      return errorResponse(
        'member_limit_reached',
        `Team is at its member limit (${maxMembers})`,
        403,
        c.get('requestId'),
      );

    let email: string | null = null;
    let username: string | null = null;
    if (invite.mode === 'email') email = invite.email!.trim().toLowerCase();
    if (invite.mode === 'username') {
      const clean = invite.username!.trim().replace(/^@/, '');
      const target = await db
        .prepare('SELECT id FROM user_profiles WHERE username = ?')
        .bind(clean)
        .first<{ id: string }>();
      if (!target)
        return errorResponse(
          'not_found',
          'No account with that @username',
          404,
          c.get('requestId'),
        );
      username = clean;
    }

    if (username || email) {
      // Resolve the target account (username lives in profiles, email in auth).
      let targetUserId: string | null = null;
      if (username) {
        const byName = await db
          .prepare('SELECT id FROM user_profiles WHERE username = ?')
          .bind(username)
          .first<{ id: string }>();
        targetUserId = byName?.id ?? null;
      } else if (email) {
        const byMail = await db
          .prepare('SELECT id FROM "user" WHERE lower(email) = ?')
          .bind(email)
          .first<{ id: string }>();
        targetUserId = byMail?.id ?? null;
      }
      if (targetUserId) {
        const existing = await db
          .prepare('SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?')
          .bind(teamId, targetUserId)
          .first<{ user_id: string }>();
        if (existing)
          return errorResponse(
            'conflict',
            'That user is already a member',
            409,
            c.get('requestId'),
          );
      }

      const pending = await db
        .prepare(
          `SELECT id FROM team_invites
            WHERE team_id = ? AND status = 'pending'
              AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND username = ?))`,
        )
        .bind(teamId, email, email, username, username)
        .first<{ id: string }>();
      if (pending)
        return errorResponse(
          'conflict',
          'A pending invite already exists for that target',
          409,
          c.get('requestId'),
        );
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

    if (invite.mode === 'email') {
      // Fail loudly rather than silently dropping the invitation (SECURITY §9 policy).
      const sender = createEmailSender(c.env);
      const inviteUrl = `${c.req.header('Origin') ?? ''}/teams/invite?team=${teamId}&token=${token}`;
      try {
        await sender.send({
          to: email!,
          subject: `You were invited to join a ConAI team`,
          text: `Accept your invite at: ${inviteUrl}`,
          html: `<p>Accept your invite at <a href="${inviteUrl}">${inviteUrl}</a></p>`,
        });
      } catch {
        return errorResponse(
          'email_not_configured',
          'Email delivery is not configured on this deployment',
          503,
          c.get('requestId'),
        );
      }
    }

    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO team_invites
           (id, team_id, invited_by, email, username, token, role, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(
          id,
          teamId,
          session.user.id,
          email,
          username,
          token,
          invite.role,
          expiresAt,
          nowIso(),
        ),
      db
        .prepare(
          'INSERT INTO team_activity (id, team_id, actor_id, type, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          teamId,
          session.user.id,
          'invite.created',
          JSON.stringify({ mode: invite.mode, role: invite.role }),
          nowIso(),
        ),
    ]);

    return c.json(
      {
        invite: {
          id,
          teamId,
          token,
          role: invite.role,
          mode: invite.mode,
          email,
          username,
          expiresAt,
        },
      },
      201,
    );
  });

  app.get('/api/v1/teams/:id/invites', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.members.invite', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const rows = await db
      .prepare(
        'SELECT * FROM team_invites WHERE team_id = ? AND status = ? ORDER BY created_at DESC',
      )
      .bind(principal.member.team_id, 'pending')
      .all<TeamInviteRow>();

    return c.json({
      invites: (rows.results ?? []).map((i) => ({
        id: i.id,
        token: i.token,
        mode: i.email ? 'email' : i.username ? 'username' : 'link',
        email: i.email,
        username: i.username,
        role: i.role,
        invitedBy: i.invited_by,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      })),
    });
  });

  app.delete('/api/v1/teams/:id/invites/:token', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.members.invite', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const invite = await db
      .prepare('SELECT * FROM team_invites WHERE team_id = ? AND token = ?')
      .bind(principal.member.team_id, c.req.param('token'))
      .first<TeamInviteRow>();
    if (!invite) return errorResponse('not_found', 'Invite not found', 404, c.get('requestId'));
    if (invite.status !== 'pending')
      return errorResponse('conflict', 'Invite is no longer pending', 409, c.get('requestId'));

    await db
      .prepare("UPDATE team_invites SET status = 'revoked' WHERE id = ?")
      .bind(invite.id)
      .run();
    await logActivity(db, principal.member.team_id, session.user.id, 'invite.revoked', {
      mode: invite.email ? 'email' : invite.username ? 'username' : 'link',
    });
    return c.json({ ok: true });
  });

  app.post('/api/v1/teams/:id/invites/:token/accept', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    // Accepting reveals the team's existence only after the token check —
    // non-members get 404 for teams they cannot see.
    const invite = await db
      .prepare('SELECT * FROM team_invites WHERE team_id = ? AND token = ?')
      .bind(c.req.param('id'), c.req.param('token'))
      .first<TeamInviteRow>();
    if (!invite) return errorResponse('not_found', 'Invite not found', 404, c.get('requestId'));
    if (invite.status === 'revoked')
      return errorResponse('invite_revoked', 'This invite was revoked', 410, c.get('requestId'));
    if (invite.status === 'accepted')
      return errorResponse(
        'invite_not_pending',
        'This invite was already used',
        409,
        c.get('requestId'),
      );
    if (invite.expires_at < nowIso()) {
      await db
        .prepare("UPDATE team_invites SET status = 'expired' WHERE id = ?")
        .bind(invite.id)
        .run();
      return errorResponse('invite_expired', 'This invite expired', 410, c.get('requestId'));
    }

    const principal = await loadPrincipal(db, invite.team_id, session.user.id);
    if (principal)
      return errorResponse(
        'conflict',
        'You are already a member of this team',
        409,
        c.get('requestId'),
      );

    if (invite.email || invite.username) {
      const profile = await db
        .prepare('SELECT username FROM user_profiles WHERE id = ?')
        .bind(session.user.id)
        .first<{ username: string }>();
      // better-auth owns the email column; profiles carry the username.
      const userRow = await db
        .prepare('SELECT email FROM "user" WHERE id = ?')
        .bind(session.user.id)
        .first<{ email: string }>();
      const email = (userRow?.email ?? '').toLowerCase();
      if (
        (invite.email && invite.email !== email) ||
        (invite.username && invite.username !== profile?.username)
      )
        return errorResponse(
          'forbidden',
          'This invite was addressed to someone else',
          403,
          c.get('requestId'),
        );
    }

    // Capacity re-checked at accept time (invites may outlive a limit change).
    const ownerPlan = await db
      .prepare(
        `SELECT pc.max_team_members FROM teams t
           JOIN user_profiles up ON up.id = t.owner_id
           JOIN plan_configs pc ON pc.id = up.plan_id
          WHERE t.id = ?`,
      )
      .bind(invite.team_id)
      .first<{ max_team_members: number | null }>();
    const maxMembers = ownerPlan?.max_team_members ?? 0;
    if (maxMembers <= 0 || (await memberCount(db, invite.team_id)) >= maxMembers)
      return errorResponse('member_limit_reached', 'This team is full', 403, c.get('requestId'));

    await db.batch([
      db
        .prepare(
          'INSERT INTO team_members (team_id, user_id, role, custom_role_id, joined_at) VALUES (?, ?, ?, NULL, ?)',
        )
        .bind(invite.team_id, session.user.id, invite.role, nowIso()),
      db
        .prepare(
          "UPDATE team_invites SET status = 'accepted', accepted_at = ?, accepted_by = ? WHERE id = ?",
        )
        .bind(nowIso(), session.user.id, invite.id),
      db
        .prepare(
          'INSERT INTO team_activity (id, team_id, actor_id, type, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          invite.team_id,
          session.user.id,
          'member.joined',
          JSON.stringify({ via: 'invite' }),
          nowIso(),
        ),
    ]);

    return c.json({ ok: true, teamId: invite.team_id, role: invite.role });
  });

  // ── Custom roles ───────────────────────────────────────────────
  const roleSchema = z.object({
    name: z.string().trim().min(1).max(50),
    permissions: z.array(z.enum(TEAM_PERMISSIONS)).min(1),
  });

  app.get('/api/v1/teams/:id/roles', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.view', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const rows = await db
      .prepare('SELECT * FROM team_roles WHERE team_id = ? ORDER BY name ASC')
      .bind(principal.member.team_id)
      .all<TeamRoleRow>();
    return c.json({
      roles: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        permissions: JSON.parse(r.permissions) as TeamPermission[],
      })),
    });
  });

  app.post('/api/v1/teams/:id/roles', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.roles.manage', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const body = await c.req.json().catch(() => null);
    const parsed = roleSchema.safeParse(body);
    if (!parsed.success)
      return errorResponse(
        'invalid_request',
        'Name and permission list required',
        400,
        c.get('requestId'),
      );

    const ownerOnly = parsed.data.permissions.filter((p) =>
      (OWNER_ONLY as readonly string[]).includes(p),
    );
    if (ownerOnly.length > 0)
      return errorResponse(
        'invalid_request',
        `Owner-only permissions cannot be granted: ${ownerOnly.join(', ')}`,
        400,
        c.get('requestId'),
      );

    const id = crypto.randomUUID();
    try {
      await db
        .prepare(
          'INSERT INTO team_roles (id, team_id, name, permissions, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(
          id,
          principal.member.team_id,
          parsed.data.name,
          JSON.stringify(parsed.data.permissions),
          nowIso(),
        )
        .run();
    } catch {
      return errorResponse(
        'conflict',
        'A role with that name already exists',
        409,
        c.get('requestId'),
      );
    }
    await logActivity(db, principal.member.team_id, session.user.id, 'team.updated', {
      customRoleCreated: parsed.data.name,
    });
    return c.json(
      { role: { id, name: parsed.data.name, permissions: parsed.data.permissions } },
      201,
    );
  });

  app.patch('/api/v1/teams/:id/roles/:roleId', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.roles.manage', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const role = await db
      .prepare('SELECT * FROM team_roles WHERE id = ? AND team_id = ?')
      .bind(c.req.param('roleId'), principal.member.team_id)
      .first<TeamRoleRow>();
    if (!role) return errorResponse('not_found', 'Custom role not found', 404, c.get('requestId'));

    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(50).optional(),
        permissions: z.array(z.enum(TEAM_PERMISSIONS)).min(1).optional(),
      })
      .refine((v) => v.name !== undefined || v.permissions !== undefined, {
        message: 'empty patch',
      })
      .safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Nothing to update', 400, c.get('requestId'));

    const permissions =
      parsed.data.permissions ?? (JSON.parse(role.permissions) as TeamPermission[]);
    const ownerOnly = permissions.filter((p) => (OWNER_ONLY as readonly string[]).includes(p));
    if (ownerOnly.length > 0)
      return errorResponse(
        'invalid_request',
        `Owner-only permissions cannot be granted: ${ownerOnly.join(', ')}`,
        400,
        c.get('requestId'),
      );

    await db
      .prepare('UPDATE team_roles SET name = ?, permissions = ? WHERE id = ?')
      .bind(parsed.data.name ?? role.name, JSON.stringify(permissions), role.id)
      .run();
    return c.json({ ok: true });
  });

  app.delete('/api/v1/teams/:id/roles/:roleId', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.roles.manage', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const role = await db
      .prepare('SELECT id FROM team_roles WHERE id = ? AND team_id = ?')
      .bind(c.req.param('roleId'), principal.member.team_id)
      .first<{ id: string }>();
    if (!role) return errorResponse('not_found', 'Custom role not found', 404, c.get('requestId'));

    // Members holding this role fall back to their built-in role set.
    await db.batch([
      db
        .prepare('UPDATE team_members SET custom_role_id = NULL WHERE custom_role_id = ?')
        .bind(role.id),
      db.prepare('DELETE FROM team_roles WHERE id = ?').bind(role.id),
    ]);
    return c.json({ ok: true });
  });

  // ── Module toggles ─────────────────────────────────────────────
  app.get('/api/v1/teams/:id/modules', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.view', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const team = await db
      .prepare('SELECT modules FROM teams WHERE id = ?')
      .bind(principal.member.team_id)
      .first<Pick<TeamRow, 'modules'>>();
    if (!team) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    return c.json({ modules: modulesOf(team) });
  });

  app.put('/api/v1/teams/:id/modules', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'team.modules.manage', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const body = await c.req.json().catch(() => null);
    const parsed = z.object({ modules: z.record(z.string(), z.boolean()) }).safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'modules object required', 400, c.get('requestId'));

    const unknown = Object.keys(parsed.data.modules).filter(
      (k) => !(TEAM_MODULES as readonly string[]).includes(k),
    );
    if (unknown.length > 0)
      return errorResponse(
        `invalid_request`,
        `Unknown modules: ${unknown.join(', ')}`,
        400,
        c.get('requestId'),
      );

    const team = await db
      .prepare('SELECT modules FROM teams WHERE id = ?')
      .bind(principal.member.team_id)
      .first<Pick<TeamRow, 'modules'>>();
    if (!team) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const merged = { ...modulesOf(team), ...parsed.data.modules };
    await db
      .prepare('UPDATE teams SET modules = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(merged), nowIso(), principal.member.team_id)
      .run();
    return c.json({ modules: merged });
  });

  // ── Activity log (30-day retention) ────────────────────────────
  app.get('/api/v1/teams/:id/activity', async (c) => {
    const session = await requireSession(c);
    if (!session)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const db = c.env.DB;
    if (!db)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const principal = await loadPrincipal(db, c.req.param('id'), session.user.id);
    if (!principal) return errorResponse('not_found', 'Team not found', 404, c.get('requestId'));
    const gate = requirePermission(principal, 'activity.view', c.get('requestId'));
    if (!gate.ok) return gate.res;

    const teamId = principal.member.team_id;
    await sweepActivity(db, teamId);
    const rows = await db
      .prepare(
        `SELECT a.*, up.username AS actor_username, up.display_name AS actor_name
           FROM team_activity a
           JOIN user_profiles up ON up.id = a.actor_id
          WHERE a.team_id = ?
          ORDER BY a.created_at DESC
          LIMIT 100`,
      )
      .bind(teamId)
      .all<TeamActivityRow & { actor_username: string; actor_name: string }>();

    return c.json({
      activity: (rows.results ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        meta: parseJson<Record<string, unknown>>(a.meta, {}),
        actorId: a.actor_id,
        actorUsername: a.actor_username,
        actorName: a.actor_name,
        createdAt: a.created_at,
      })),
    });
  });
}
