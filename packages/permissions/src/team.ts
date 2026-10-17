/**
 * ConAI team permissions — evaluated **server-side for every mutation**.
 * Custom roles are exact permission lists; built-in roles are fixed sets.
 */

export const TEAM_PERMISSIONS = [
  'team.view',
  'team.settings.manage',
  'team.modules.manage',
  'team.members.invite',
  'team.members.remove',
  'team.roles.manage',
  'team.transfer_ownership',
  'team.delete',
  'projects.view',
  'projects.create',
  'projects.edit',
  'projects.delete',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'tasks.delete',
  'channels.view',
  'channels.post',
  'channels.manage',
  'documents.view',
  'documents.edit',
  'documents.delete',
  'calendar.view',
  'calendar.edit',
  'activity.view',
  'automations.view',
  'automations.manage',
  'files.download',
  'files.upload',
  'files.delete',
  'ai.use',
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export const TEAM_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

const VIEW_PERMISSIONS: TeamPermission[] = [
  'team.view',
  'projects.view',
  'tasks.view',
  'channels.view',
  'documents.view',
  'calendar.view',
  'activity.view',
  'automations.view',
  'files.download',
];

const MEMBER_PERMISSIONS: TeamPermission[] = [
  ...VIEW_PERMISSIONS,
  'channels.post',
  'documents.edit',
  'calendar.edit',
  'files.upload',
  'tasks.create',
  'tasks.edit',
  'ai.use',
];

const ADMIN_PERMISSIONS: TeamPermission[] = [
  ...MEMBER_PERMISSIONS,
  'projects.create',
  'projects.edit',
  'projects.delete',
  'tasks.delete',
  'channels.manage',
  'documents.delete',
  'files.delete',
  'automations.manage',
  'team.settings.manage',
  'team.modules.manage',
  'team.members.invite',
  'team.members.remove',
  'team.roles.manage',
];

const OWNER_PERMISSIONS: TeamPermission[] = [
  ...ADMIN_PERMISSIONS,
  'team.transfer_ownership',
  'team.delete',
];

export const TEAM_ROLE_PERMISSIONS: Record<TeamRole, readonly TeamPermission[]> = {
  owner: Object.freeze(OWNER_PERMISSIONS),
  admin: Object.freeze(ADMIN_PERMISSIONS),
  member: Object.freeze(MEMBER_PERMISSIONS),
  viewer: Object.freeze(VIEW_PERMISSIONS),
};

/**
 * A principal's effective team authority.
 * `customRolePermissions` (custom roles) replace the built-in set when present.
 */
export interface TeamPrincipal {
  role: TeamRole;
  customRolePermissions?: readonly TeamPermission[] | null;
}

export function effectiveTeamPermissions(principal: TeamPrincipal): readonly TeamPermission[] {
  return principal.customRolePermissions ?? TEAM_ROLE_PERMISSIONS[principal.role];
}

export function teamCan(principal: TeamPrincipal, permission: TeamPermission): boolean {
  return effectiveTeamPermissions(principal).includes(permission);
}

export function teamCanAll(
  principal: TeamPrincipal,
  permissions: readonly TeamPermission[],
): boolean {
  const effective = effectiveTeamPermissions(principal);
  return permissions.every((p) => effective.includes(p));
}

export function isValidCustomRolePermissions(
  permissions: readonly string[],
): permissions is TeamPermission[] {
  const allowed = new Set<string>(TEAM_PERMISSIONS);
  return permissions.length > 0 && permissions.every((p) => allowed.has(p));
}
