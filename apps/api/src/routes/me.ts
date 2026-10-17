/**
 * Account routes (`/api/v1/*`) — session-scoped reads/writes around better-auth.
 *
 * Security notes:
 *  - session resolution is server-side from cookies only (never from bodies);
 *  - session tokens from listSessions are NEVER returned to clients;
 *  - reads are `Cache-Control: no-store`.
 */

import type { Hono, Context } from 'hono';
import { z } from 'zod';
import { SESSION_COOKIES, createCsrfCookie, ensureAccountShell } from '@conai/auth';
import { effectiveDailyLimit, type PlanConfigRow } from '@conai/database';
import { nextUtcMidnight } from '@conai/sparks';
import type { AppEnv } from '../env';
import { enabledSocialProviders, getAuth } from '../auth';
import { errorResponse } from '../middleware/security';

/** Session required — returns typed session data or null (caller returns 401). */
async function requireSession(c: Context<AppEnv>) {
  const auth = getAuth(c.env);
  const data = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  return data;
}

export function registerAccountRoutes(app: Hono<AppEnv>): void {
  // ── CSRF token (double-submit) ──────────────────────────────────────────
  app.get('/api/v1/csrf', (c) => {
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

  // ── Enabled social providers (configured credentials only) ──────────────
  app.get('/api/v1/auth/providers', (c) => {
    return c.json({ providers: enabledSocialProviders(c.env) });
  });

  // ── Plans (public catalog) ──────────────────────────────────────────────
  app.get('/api/v1/plans', async (c) => {
    if (!c.env.DB)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));
    const rows = await c.env.DB.prepare(
      `SELECT id, name, price_label, daily_sparks, personal_storage_mb, team_storage_mb,
              max_team_members, max_teams_per_account, requires_verification, sort_order
       FROM plan_configs WHERE active = 1 ORDER BY sort_order`,
    ).all<PlanConfigRow>();
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({
      plans: (rows.results ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        priceLabel: p.price_label,
        dailySparks: p.daily_sparks,
        personalStorageMb: p.personal_storage_mb,
        teamStorageMb: p.team_storage_mb,
        maxTeamMembers: p.max_team_members,
        maxTeamsPerAccount: p.max_teams_per_account,
        requiresVerification: p.requires_verification === 1,
      })),
    });
  });

  // ── Current account ─────────────────────────────────────────────────────
  app.get('/api/v1/me', async (c) => {
    const auth = getAuth(c.env);
    const data = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!data) return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    if (!c.env.DB)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const shell = await ensureAccountShell(c.env.DB, data.user.id);
    if (!shell)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));

    const [wallet, plan] = await Promise.all([
      c.env.DB.prepare(
        `SELECT balance, daily_limit_override, last_refill_at FROM spark_wallets WHERE user_id = ?`,
      )
        .bind(data.user.id)
        .first<{ balance: number; daily_limit_override: number | null; last_refill_at: string }>(),
      c.env.DB.prepare(`SELECT id, daily_sparks FROM plan_configs WHERE id = ?`)
        .bind(shell.planId)
        .first<{ id: string; daily_sparks: number | null }>(),
    ]);

    c.header('Cache-Control', 'no-store');
    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        emailVerified: data.user.emailVerified === true,
        username: shell.username,
        displayName: shell.displayName,
        locale: shell.locale,
        planId: shell.planId,
        referralCode: shell.referralCode,
        avatarUrl: (data.user.image as string | null | undefined) ?? null,
      },
      wallet: {
        balance: wallet?.balance ?? 0,
        dailyLimit: effectiveDailyLimit(
          { daily_limit_override: wallet?.daily_limit_override ?? null },
          plan ?? null,
        ),
        lastRefillAt: wallet?.last_refill_at ?? null,
        nextRefillAt: nextUtcMidnight().toISOString(),
      },
    });
  });

  app.patch('/api/v1/me', async (c) => {
    const auth = getAuth(c.env);
    const data = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!data) return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    if (!c.env.DB)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        displayName: z.string().trim().min(1).max(60).optional(),
        locale: z.enum(['en', 'vi']).optional(),
      })
      .safeParse(body);
    if (!parsed.success)
      return errorResponse('invalid_request', 'Invalid profile payload', 400, c.get('requestId'));
    if (parsed.data.displayName === undefined && parsed.data.locale === undefined) {
      return errorResponse(
        'invalid_request',
        'No updatable fields provided',
        400,
        c.get('requestId'),
      );
    }

    const shell = await ensureAccountShell(c.env.DB, data.user.id);
    if (!shell)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE user_profiles
         SET display_name = COALESCE(?, display_name),
             locale = COALESCE(?, locale),
             updated_at = ?
       WHERE id = ?`,
    )
      .bind(parsed.data.displayName ?? null, parsed.data.locale ?? null, now, data.user.id)
      .run();

    c.header('Cache-Control', 'no-store');
    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        emailVerified: data.user.emailVerified === true,
        username: shell.username,
        displayName: parsed.data.displayName ?? shell.displayName,
        locale: parsed.data.locale ?? shell.locale,
        planId: shell.planId,
        referralCode: shell.referralCode,
        avatarUrl: (data.user.image as string | null | undefined) ?? null,
      },
    });
  });

  // ── Sessions (list / revoke) — tokens stay server-side ──────────────────
  app.get('/api/v1/me/sessions', async (c) => {
    const guard = await requireSession(c);
    if (!guard)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const auth = getAuth(c.env);
    const sessions = await auth.api.listSessions({ headers: c.req.raw.headers }).catch(() => null);
    if (!sessions)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));

    c.header('Cache-Control', 'no-store');
    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
        expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : String(s.expiresAt),
        userAgent: s.userAgent ?? null,
        ipAddress: s.ipAddress ?? null,
        isCurrent: guard.session.id === s.id,
      })),
    });
  });

  app.delete('/api/v1/me/sessions/:id', async (c) => {
    const guard = await requireSession(c);
    if (!guard)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    const auth = getAuth(c.env);
    const sessions = await auth.api.listSessions({ headers: c.req.raw.headers }).catch(() => null);
    if (!sessions)
      return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));

    const target = sessions.find((s) => s.id === c.req.param('id'));
    if (!target) return errorResponse('not_found', 'Session not found', 404, c.get('requestId'));

    await auth.api.revokeSession({ headers: c.req.raw.headers, body: { token: target.token } });
    return c.json({ success: true });
  });

  // ── Linked social accounts (OAuth identities; passwords live in `account.password`) ──
  app.get('/api/v1/me/accounts', async (c) => {
    const auth = getAuth(c.env);
    const data = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!data) return errorResponse('unauthenticated', 'Sign in required', 401, c.get('requestId'));
    if (!c.env.DB)
      return errorResponse('not_configured', 'Database unavailable', 503, c.get('requestId'));

    const rows = await c.env.DB.prepare(
      `SELECT id, providerId, accountId, createdAt FROM "account"
       WHERE userId = ? AND providerId != 'credential'`,
    )
      .bind(data.user.id)
      .all<{ id: string; providerId: string; accountId: string; createdAt: string }>();

    c.header('Cache-Control', 'no-store');
    return c.json({
      accounts: (rows.results ?? []).map((a) => ({
        id: a.id,
        providerId: a.providerId,
        accountIdMasked: `••••${a.accountId.slice(-4)}`,
        linkedAt: a.createdAt,
      })),
    });
  });
}
