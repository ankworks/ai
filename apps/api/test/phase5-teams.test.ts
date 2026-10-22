/**
 * Phase 5 route tests — Teams core:
 * plan entitlement, team CRUD, invites (link/email/@username) + accept,
 * membership roles, permission enforcement (built-in + custom roles),
 * module toggles, ownership transfer, activity log (30-day retention).
 */

import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { createApp } from '../src/app';
import type { Env } from '../src/env';
import { createSession, makeApp, realDb } from './helpers';

const ORIGIN = 'http://localhost:5175';

interface Harness {
  app: ReturnType<typeof createApp>;
  env: Env;
  sqlite: DatabaseSync;
  owner: { cookie: string; userId: string; username: string; email: string };
  member: { cookie: string; userId: string; username: string; email: string };
}

let n = 0;
function rid(): string {
  n += 1;
  return `t5${n}${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function harness(): Promise<Harness> {
  const { db, sqlite } = realDb();
  const { app, env } = makeApp({}, { DB: db });
  const suffix = rid();
  const owner = await createSession(app, env, sqlite, {
    email: `owner-${suffix}@conai.test`,
    username: `owner${suffix}`,
  });
  const member = await createSession(app, env, sqlite, {
    email: `member-${suffix}@conai.test`,
    username: `member${suffix}`,
  });
  // Owner moves to the (free) Teams plan — the plan entitled to teams.
  sqlite.prepare("UPDATE user_profiles SET plan_id = 'teams' WHERE id = ?").run(owner.userId);
  return {
    app,
    env,
    sqlite,
    owner: { ...owner, username: `owner${suffix}`, email: `owner-${suffix}@conai.test` },
    member: { ...member, username: `member${suffix}`, email: `member-${suffix}@conai.test` },
  };
}

function headers(h: { cookie: string }): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Cookie: `${h.cookie}; conai_csrf=csrf-phase5`,
    'X-CSRF-Token': 'csrf-phase5',
  };
}

function readHeaders(h: { cookie: string }): Record<string, string> {
  return { Origin: ORIGIN, Cookie: h.cookie };
}

/** Every request runs with the validated env binding (c.env). */
async function rq(h: Harness, path: string, init?: RequestInit): Promise<Response> {
  return h.app.request(path, init, h.env);
}

async function createTeam(h: Harness, name = 'Design team'): Promise<string> {
  const res = await rq(h, '/api/v1/teams', {
    method: 'POST',
    headers: headers(h.owner),
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { team: { id: string } };
  return body.team.id;
}

describe('Phase 5 — Teams (core)', () => {
  it('personal plan cannot create teams (plan_not_entitled)', async () => {
    const h = await harness();
    // member stays on the default personal plan
    const res = await rq(h, '/api/v1/teams', {
      method: 'POST',
      headers: headers(h.member),
      body: JSON.stringify({ name: 'Solo' }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'plan_not_entitled',
    );
  });

  it('free plan self-selection: teams selectable, student/enterprise are not', async () => {
    const h = await harness();
    const patch = (planId: string) =>
      rq(h, '/api/v1/me', {
        method: 'PATCH',
        headers: headers(h.member),
        body: JSON.stringify({ planId }),
      });
    const ok = await patch('teams');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { user: { planId: string } }).user.planId).toBe('teams');

    const student = await patch('student');
    expect(student.status).toBe(403);
    expect(((await student.json()) as { error: { code: string } }).error.code).toBe(
      'plan_not_selectable',
    );
    const enterprise = await patch('enterprise');
    expect(enterprise.status).toBe(403);
  });

  it('creates a team with the caller as owner and logs activity', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    const res = await rq(h, `/api/v1/teams/${teamId}`, { headers: readHeaders(h.owner) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      team: { name: string; myRole: string; memberCount: number; modules: Record<string, boolean> };
    };
    expect(body.team.name).toBe('Design team');
    expect(body.team.myRole).toBe('owner');
    expect(body.team.memberCount).toBe(1);
    expect(body.team.modules.projects).toBe(true);

    const activity = await rq(h, `/api/v1/teams/${teamId}/activity`, {
      headers: readHeaders(h.owner),
    });
    const log = (await activity.json()) as { activity: Array<{ type: string }> };
    expect(log.activity.some((a) => a.type === 'team.created')).toBe(true);
  });

  it('enforces 5 teams per account', async () => {
    const h = await harness();
    for (let i = 0; i < 5; i++) await createTeam(h, `Team ${i}`);
    const sixth = await rq(h, '/api/v1/teams', {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ name: 'Sixth' }),
    });
    expect(sixth.status).toBe(403);
    expect(((await sixth.json()) as { error: { code: string } }).error.code).toBe(
      'team_limit_reached',
    );
  });

  it('lists only my teams and hides team details from non-members', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    const mine = await rq(h, '/api/v1/teams', { headers: readHeaders(h.owner) });
    const body = (await mine.json()) as { teams: Array<{ id: string; role: string }> };
    expect(body.teams.some((t) => t.id === teamId)).toBe(true);

    const stranger = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.member),
    });
    expect(stranger.status).toBe(404);
  });

  it('rename requires team.settings.manage (viewer denied, owner allowed)', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'viewer', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    const asViewer = await rq(h, `/api/v1/teams/${teamId}`, {
      method: 'PATCH',
      headers: headers(h.member),
      body: JSON.stringify({ name: 'Hacked' }),
    });
    expect(asViewer.status).toBe(403);

    const asOwner = await rq(h, `/api/v1/teams/${teamId}`, {
      method: 'PATCH',
      headers: headers(h.owner),
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(asOwner.status).toBe(200);
    const detail = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.owner),
    });
    expect(((await detail.json()) as { team: { name: string } }).team.name).toBe('Renamed');
  });

  it('username invite → accept makes the user a member with the invited role', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    const invite = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'username', username: h.member.username, role: 'admin' }),
    });
    expect(invite.status).toBe(201);

    const pending = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      headers: readHeaders(h.owner),
    });
    expect(((await pending.json()) as { invites: unknown[] }).invites.length).toBe(1);

    const accept = await rq(
      h,
      `/api/v1/teams/${teamId}/invites/${((await invite.json()) as { invite: { token: string } }).invite.token}/accept`,
      { method: 'POST', headers: headers(h.member) },
    );
    expect(accept.status).toBe(200);

    const roster = await rq(h, `/api/v1/teams/${teamId}/members`, {
      headers: readHeaders(h.member),
    });
    const body = (await roster.json()) as {
      members: Array<{ userId: string; role: string; username: string }>;
    };
    expect(body.members.find((m) => m.userId === h.member.userId)?.role).toBe('admin');
    expect(body.members.find((m) => m.userId === h.member.userId)?.username).toBe(
      h.member.username,
    );
  });

  it('email invite only accepts for the addressed account', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    const invite = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'email', email: h.member.email, role: 'member' }),
    });
    expect(invite.status).toBe(201);
    const token = ((await invite.json()) as { invite: { token: string } }).invite.token;

    // A third, non-member account cannot consume a targeted invite.
    const stranger = await createSession(h.app, h.env, h.sqlite, {
      email: `stranger-${rid()}@conai.test`,
      username: `stranger${rid()}`,
    });
    const wrong = await rq(h, `/api/v1/teams/${teamId}/invites/${token}/accept`, {
      method: 'POST',
      headers: headers(stranger),
    });
    expect(wrong.status).toBe(403);

    const right = await rq(h, `/api/v1/teams/${teamId}/invites/${token}/accept`, {
      method: 'POST',
      headers: headers(h.member),
    });
    expect(right.status).toBe(200);
    // Second use is rejected.
    const reuse = await rq(h, `/api/v1/teams/${teamId}/invites/${token}/accept`, {
      method: 'POST',
      headers: headers(h.member),
    });
    expect(reuse.status).toBe(409);
  });

  it('link invites are open to anyone with the token', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    const invite = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'link' }),
    });
    const token = ((await invite.json()) as { invite: { token: string } }).invite.token;
    const accept = await rq(h, `/api/v1/teams/${teamId}/invites/${token}/accept`, {
      method: 'POST',
      headers: headers(h.member),
    });
    expect(accept.status).toBe(200);
  });

  it('rejects duplicate pending invites and inviting existing members', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    const first = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'username', username: h.member.username }),
    });
    expect(first.status).toBe(201);
    const again = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'username', username: h.member.username }),
    });
    expect(again.status).toBe(409);

    await rq(
      h,
      `/api/v1/teams/${teamId}/invites/${((await first.json()) as { invite: { token: string } }).invite.token}/accept`,
      { method: 'POST', headers: headers(h.member) },
    );
    const inviteMember = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'username', username: h.member.username }),
    });
    expect(inviteMember.status).toBe(409);
  });

  it('expired and revoked invites cannot be accepted', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    const expired = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'link' }),
    });
    const expiredToken = ((await expired.json()) as { invite: { token: string } }).invite.token;
    h.sqlite
      .prepare("UPDATE team_invites SET expires_at = '2020-01-01T00:00:00.000Z' WHERE token = ?")
      .run(expiredToken);
    const acceptExpired = await rq(h, `/api/v1/teams/${teamId}/invites/${expiredToken}/accept`, {
      method: 'POST',
      headers: headers(h.member),
    });
    expect(acceptExpired.status).toBe(410);
    expect(((await acceptExpired.json()) as { error: { code: string } }).error.code).toBe(
      'invite_expired',
    );

    const revoked = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'link' }),
    });
    const revokedToken = ((await revoked.json()) as { invite: { token: string } }).invite.token;
    const revokeRes = await rq(h, `/api/v1/teams/${teamId}/invites/${revokedToken}`, {
      method: 'DELETE',
      headers: headers(h.owner),
    });
    expect(revokeRes.status).toBe(200);
    const acceptRevoked = await rq(h, `/api/v1/teams/${teamId}/invites/${revokedToken}/accept`, {
      method: 'POST',
      headers: headers(h.member),
    });
    expect(acceptRevoked.status).toBe(410);
  });

  it('enforces the 30-member team cap at accept time', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    // Fill the team to the TEAMS-plan cap (30) directly.
    const stmt = h.sqlite.prepare(
      'INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
    );
    for (let i = 0; i < 29; i++) {
      stmt.run(teamId, `u-${rid()}-${i}`, 'member', new Date().toISOString());
    }
    const invite = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ mode: 'link' }),
    });
    expect(invite.status).toBe(403);
    expect(((await invite.json()) as { error: { code: string } }).error.code).toBe(
      'member_limit_reached',
    );
  });

  it('viewers can read the roster but cannot invite or remove', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'viewer', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    const roster = await rq(h, `/api/v1/teams/${teamId}/members`, {
      headers: readHeaders(h.member),
    });
    expect(roster.status).toBe(200);

    const invite = await rq(h, `/api/v1/teams/${teamId}/invites`, {
      method: 'POST',
      headers: headers(h.member),
      body: JSON.stringify({ mode: 'link' }),
    });
    expect(invite.status).toBe(403);

    const remove = await rq(h, `/api/v1/teams/${teamId}/members/${h.owner.userId}`, {
      method: 'DELETE',
      headers: headers(h.member),
    });
    expect(remove.status).toBe(403);
  });

  it('members cannot manage roles; admins can (and never touch the owner)', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    // member lacks team.roles.manage
    const byMember = await rq(h, `/api/v1/teams/${teamId}/members/${h.owner.userId}`, {
      method: 'PATCH',
      headers: headers(h.member),
      body: JSON.stringify({ role: 'viewer' }),
    });
    expect(byMember.status).toBe(403);

    // promote member → admin, then admin manages roles
    await rq(h, `/api/v1/teams/${teamId}/members/${h.member.userId}`, {
      method: 'PATCH',
      headers: headers(h.owner),
      body: JSON.stringify({ role: 'admin' }),
    });

    const demoteOther = await rq(h, `/api/v1/teams/${teamId}/members/${h.owner.userId}`, {
      method: 'PATCH',
      headers: headers(h.member),
      body: JSON.stringify({ role: 'member' }),
    });
    expect(demoteOther.status).toBe(403); // owner is untouchable

    const self = await rq(h, `/api/v1/teams/${teamId}/members/${h.member.userId}`, {
      method: 'PATCH',
      headers: headers(h.member),
      body: JSON.stringify({ role: 'viewer' }),
    });
    expect(self.status).toBe(403); // no self-role-change
  });

  it('removal: owner cannot be removed, members can leave, owner cannot leave', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    const removeOwner = await rq(h, `/api/v1/teams/${teamId}/members/${h.owner.userId}`, {
      method: 'DELETE',
      headers: headers(h.owner),
    });
    expect(removeOwner.status).toBe(403);

    const ownerLeaves = await rq(h, `/api/v1/teams/${teamId}/members/${h.owner.userId}`, {
      method: 'DELETE',
      headers: headers(h.owner),
    });
    expect(ownerLeaves.status).toBe(403); // transfer first

    const memberLeaves = await rq(h, `/api/v1/teams/${teamId}/members/${h.member.userId}`, {
      method: 'DELETE',
      headers: headers(h.member),
    });
    expect(memberLeaves.status).toBe(200);

    const gone = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.member),
    });
    expect(gone.status).toBe(404);
  });

  it('ownership transfer swaps roles and updates the team row', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    const res = await rq(h, `/api/v1/teams/${teamId}/transfer`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ userId: h.member.userId }),
    });
    expect(res.status).toBe(200);

    const detail = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.member),
    });
    const body = (await detail.json()) as { team: { myRole: string; ownerId: string } };
    expect(body.team.myRole).toBe('owner');
    expect(body.team.ownerId).toBe(h.member.userId);

    const oldOwner = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.owner),
    });
    expect(((await oldOwner.json()) as { team: { myRole: string } }).team.myRole).toBe('admin');
  });

  it('module toggles: owner-managed, visible to all members', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    const denied = await rq(h, `/api/v1/teams/${teamId}/modules`, {
      method: 'PUT',
      headers: headers(h.member),
      body: JSON.stringify({ modules: { channels: false } }),
    });
    expect(denied.status).toBe(403);

    const put = await rq(h, `/api/v1/teams/${teamId}/modules`, {
      method: 'PUT',
      headers: headers(h.owner),
      body: JSON.stringify({ modules: { channels: false, calendar: false } }),
    });
    expect(put.status).toBe(200);

    const read = await rq(h, `/api/v1/teams/${teamId}/modules`, {
      headers: readHeaders(h.member),
    });
    const body = (await read.json()) as { modules: Record<string, boolean> };
    expect(body.modules.channels).toBe(false);
    expect(body.modules.calendar).toBe(false);
    expect(body.modules.overview).toBe(true);

    const badModule = await rq(h, `/api/v1/teams/${teamId}/modules`, {
      method: 'PUT',
      headers: headers(h.owner),
      body: JSON.stringify({ modules: { nonsense: true } }),
    });
    expect(badModule.status).toBe(400);
  });

  it('custom roles replace built-in permission sets', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'viewer', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    // owner-only permissions are never grantable
    const evil = await rq(h, `/api/v1/teams/${teamId}/roles`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ name: 'Godmode', permissions: ['team.delete', 'team.view'] }),
    });
    expect(evil.status).toBe(400);

    const created = await rq(h, `/api/v1/teams/${teamId}/roles`, {
      method: 'POST',
      headers: headers(h.owner),
      body: JSON.stringify({ name: 'Broadcaster', permissions: ['team.view', 'channels.post'] }),
    });
    expect(created.status).toBe(201);
    const roleId = ((await created.json()) as { role: { id: string } }).role.id;

    const assigned = await rq(h, `/api/v1/teams/${teamId}/members/${h.member.userId}`, {
      method: 'PATCH',
      headers: headers(h.owner),
      body: JSON.stringify({ customRoleId: roleId }),
    });
    expect(assigned.status).toBe(200);

    const detail = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.member),
    });
    const perms = ((await detail.json()) as { team: { myPermissions: string[] } }).team
      .myPermissions;
    expect(perms).toContain('channels.post');
    expect(perms).not.toContain('channels.manage');

    // deleting the custom role falls members back to their built-in set
    const removed = await rq(h, `/api/v1/teams/${teamId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: headers(h.owner),
    });
    expect(removed.status).toBe(200);
    const after = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.member),
    });
    const fallback = ((await after.json()) as { team: { myPermissions: string[] } }).team
      .myPermissions;
    expect(fallback).not.toContain('channels.post'); // plain viewer again
  });

  it('activity log keeps 30 days only', async () => {
    const h = await harness();
    const teamId = await createTeam(h);

    h.sqlite
      .prepare(
        "INSERT INTO team_activity (id, team_id, actor_id, type, meta, created_at) VALUES (?, ?, ?, 'member.joined', '{}', '2020-01-01T00:00:00.000Z')",
      )
      .run('old-row', teamId, h.owner.userId);

    const res = await rq(h, `/api/v1/teams/${teamId}/activity`, {
      headers: readHeaders(h.owner),
    });
    const body = (await res.json()) as { activity: Array<{ id: string; type: string }> };
    expect(body.activity.some((a) => a.id === 'old-row')).toBe(false);
    expect(body.activity.some((a) => a.type === 'team.created')).toBe(true);
  });

  it('only the owner can delete the team; members lose access afterwards', async () => {
    const h = await harness();
    const teamId = await createTeam(h);
    h.sqlite
      .prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      )
      .run(teamId, h.member.userId, new Date().toISOString());

    const byMember = await rq(h, `/api/v1/teams/${teamId}`, {
      method: 'DELETE',
      headers: headers(h.member),
    });
    expect(byMember.status).toBe(403);

    const byOwner = await rq(h, `/api/v1/teams/${teamId}`, {
      method: 'DELETE',
      headers: headers(h.owner),
    });
    expect(byOwner.status).toBe(200);

    const gone = await rq(h, `/api/v1/teams/${teamId}`, {
      headers: readHeaders(h.owner),
    });
    expect(gone.status).toBe(404);
  });

  it('unauthenticated requests are rejected', async () => {
    const h = await harness();
    const res = await rq(h, '/api/v1/teams', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(401);
  });
});
