import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLES,
  adminCan,
  adminCanAll,
  canGrantRole,
  effectiveAdminPermissions,
  effectiveTeamPermissions,
  isValidCustomAdminPermissions,
  isValidCustomRolePermissions,
  teamCan,
  teamCanAll,
} from './index';

describe('team roles', () => {
  it('viewer is read-only (no posting, no AI)', () => {
    const viewer = { role: 'viewer' as const };
    expect(teamCan(viewer, 'team.view')).toBe(true);
    expect(teamCan(viewer, 'files.download')).toBe(true);
    expect(teamCan(viewer, 'channels.post')).toBe(false);
    expect(teamCan(viewer, 'ai.use')).toBe(false);
    expect(teamCan(viewer, 'tasks.create')).toBe(false);
  });

  it('member can contribute but not administer', () => {
    const member = { role: 'member' as const };
    expect(teamCan(member, 'channels.post')).toBe(true);
    expect(teamCan(member, 'tasks.edit')).toBe(true);
    expect(teamCan(member, 'ai.use')).toBe(true);
    expect(teamCan(member, 'team.members.invite')).toBe(false);
    expect(teamCan(member, 'team.settings.manage')).toBe(false);
    expect(teamCan(member, 'projects.delete')).toBe(false);
  });

  it('admin manages everything except ownership transfer/deletion', () => {
    const admin = { role: 'admin' as const };
    expect(teamCan(admin, 'team.members.remove')).toBe(true);
    expect(teamCan(admin, 'automations.manage')).toBe(true);
    expect(teamCan(admin, 'team.roles.manage')).toBe(true);
    expect(teamCan(admin, 'team.transfer_ownership')).toBe(false);
    expect(teamCan(admin, 'team.delete')).toBe(false);
  });

  it('owner holds every team permission', () => {
    const owner = { role: 'owner' as const };
    expect(teamCan(owner, 'team.transfer_ownership')).toBe(true);
    expect(teamCan(owner, 'team.delete')).toBe(true);
    expect(teamCanAll(owner, ['team.settings.manage', 'projects.delete', 'ai.use'])).toBe(true);
  });

  it('custom roles override the built-in set exactly', () => {
    const custom = { role: 'member' as const, customRolePermissions: ['team.view' as const] };
    expect(effectiveTeamPermissions(custom)).toEqual(['team.view']);
    expect(teamCan(custom, 'team.view')).toBe(true);
    expect(teamCan(custom, 'channels.post')).toBe(false);
  });

  it('validates custom permission lists', () => {
    expect(isValidCustomRolePermissions(['team.view', 'channels.post'])).toBe(true);
    expect(isValidCustomRolePermissions(['team.view', 'bogus.permission'])).toBe(false);
    expect(isValidCustomRolePermissions([])).toBe(false);
  });
});

describe('admin roles', () => {
  it('owner has every admin permission', () => {
    const owner = { role: 'owner' as const };
    expect(adminCan(owner, 'admin.grant_owner')).toBe(true);
    expect(adminCan(owner, 'admin.lockdown')).toBe(true);
    expect(adminCanAll(owner, ['admin.settings.manage', 'admin.credentials.manage'])).toBe(true);
  });

  it('administrator cannot grant Owner', () => {
    const admin = { role: 'administrator' as const };
    expect(adminCan(admin, 'admin.users.manage')).toBe(true);
    expect(adminCan(admin, 'admin.settings.manage')).toBe(true);
    expect(adminCan(admin, 'admin.grant_owner')).toBe(false);
    expect(canGrantRole('administrator', 'owner')).toBe(false);
    expect(canGrantRole('administrator', 'moderator')).toBe(true);
  });

  it('moderator can review but not configure providers', () => {
    const mod = { role: 'moderator' as const };
    expect(adminCan(mod, 'admin.trust.review')).toBe(true);
    expect(adminCan(mod, 'admin.reports.review')).toBe(true);
    expect(adminCan(mod, 'admin.providers.manage')).toBe(false);
    expect(adminCan(mod, 'admin.users.manage')).toBe(false);
    expect(adminCan(mod, 'admin.verification.review')).toBe(false);
  });

  it('student reviewer is scoped to verification', () => {
    const reviewer = { role: 'student_reviewer' as const };
    expect(adminCan(reviewer, 'admin.verification.review')).toBe(true);
    expect(adminCan(reviewer, 'admin.users.view')).toBe(false);
    expect(adminCan(reviewer, 'admin.sparks.adjust')).toBe(false);
  });

  it('ai manager covers providers/models/governance only', () => {
    const ai = { role: 'ai_manager' as const };
    expect(
      adminCanAll(ai, ['admin.providers.manage', 'admin.models.manage', 'admin.governance.manage']),
    ).toBe(true);
    expect(adminCan(ai, 'admin.users.manage')).toBe(false);
    expect(adminCan(ai, 'admin.settings.manage')).toBe(false);
  });

  it('support agent cannot touch Sparks or credentials', () => {
    const support = { role: 'support_agent' as const };
    expect(adminCan(support, 'admin.users.view')).toBe(true);
    expect(adminCan(support, 'admin.sparks.adjust')).toBe(false);
    expect(adminCan(support, 'admin.credentials.manage')).toBe(false);
    expect(adminCan(support, 'admin.roles.manage')).toBe(false);
  });

  it('custom admin roles override built-ins', () => {
    const custom = {
      role: 'support_agent' as const,
      customRolePermissions: ['admin.dashboard.view' as const],
    };
    expect(effectiveAdminPermissions(custom)).toEqual(['admin.dashboard.view']);
    expect(adminCan(custom, 'admin.users.view')).toBe(false);
  });

  it('every defined admin role has a permission set', () => {
    for (const role of ADMIN_ROLES) {
      expect(effectiveAdminPermissions({ role }).length).toBeGreaterThan(0);
    }
  });

  it('validates custom admin permission lists', () => {
    expect(isValidCustomAdminPermissions(['admin.dashboard.view'])).toBe(true);
    expect(isValidCustomAdminPermissions(['admin.evil'])).toBe(false);
    expect(isValidCustomAdminPermissions([])).toBe(false);
  });

  it('only owner can be granted owner', () => {
    expect(canGrantRole('owner', 'owner')).toBe(true);
    for (const role of ADMIN_ROLES.filter((r) => r !== 'owner')) {
      expect(canGrantRole(role, 'owner')).toBe(false);
    }
  });
});
