/**
 * ConAI admin permissions — enforced server-side on every admin route.
 * Admin authentication (MFA) is separate from user sessions; these checks assume an
 * authenticated admin session already exists.
 */

export const ADMIN_PERMISSIONS = [
  'admin.dashboard.view',
  'admin.users.view',
  'admin.users.manage',
  'admin.verification.review',
  'admin.teams.view',
  'admin.teams.manage',
  'admin.providers.manage',
  'admin.models.manage',
  'admin.credentials.manage',
  'admin.sparks.view',
  'admin.sparks.adjust',
  'admin.referrals.manage',
  'admin.storage.view',
  'admin.governance.manage',
  'admin.trust.review',
  'admin.reports.review',
  'admin.maintenance.manage',
  'admin.notifications.manage',
  'admin.audit.view',
  'admin.settings.manage',
  'admin.roles.manage',
  'admin.grant_owner',
  'admin.lockdown',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLES = [
  'owner',
  'administrator',
  'moderator',
  'student_reviewer',
  'ai_manager',
  'support_agent',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const DASHBOARD: AdminPermission[] = ['admin.dashboard.view'];

const OWNER: AdminPermission[] = [...ADMIN_PERMISSIONS];

const ADMINISTRATOR: AdminPermission[] = ADMIN_PERMISSIONS.filter((p) => p !== 'admin.grant_owner');

const MODERATOR: AdminPermission[] = [
  ...DASHBOARD,
  'admin.users.view',
  'admin.teams.view',
  'admin.trust.review',
  'admin.reports.review',
  'admin.audit.view',
];

const STUDENT_REVIEWER: AdminPermission[] = [...DASHBOARD, 'admin.verification.review'];

const AI_MANAGER: AdminPermission[] = [
  ...DASHBOARD,
  'admin.providers.manage',
  'admin.models.manage',
  'admin.governance.manage',
  'admin.sparks.view',
  'admin.storage.view',
];

const SUPPORT_AGENT: AdminPermission[] = [
  ...DASHBOARD,
  'admin.users.view',
  'admin.teams.view',
  'admin.referrals.manage',
  'admin.reports.review',
  'admin.notifications.manage',
];

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: Object.freeze(OWNER),
  administrator: Object.freeze(ADMINISTRATOR),
  moderator: Object.freeze(MODERATOR),
  student_reviewer: Object.freeze(STUDENT_REVIEWER),
  ai_manager: Object.freeze(AI_MANAGER),
  support_agent: Object.freeze(SUPPORT_AGENT),
};

/** Roles a given admin is allowed to grant (only Owner may grant Owner). */
export const GRANTABLE_ROLES: Record<AdminRole, readonly AdminRole[]> = {
  owner: ADMIN_ROLES,
  administrator: ADMIN_ROLES.filter((r) => r !== 'owner'),
  moderator: [],
  student_reviewer: [],
  ai_manager: [],
  support_agent: [],
};

export interface AdminPrincipal {
  role: AdminRole;
  customRolePermissions?: readonly AdminPermission[] | null;
}

export function effectiveAdminPermissions(principal: AdminPrincipal): readonly AdminPermission[] {
  return principal.customRolePermissions ?? ADMIN_ROLE_PERMISSIONS[principal.role];
}

export function adminCan(principal: AdminPrincipal, permission: AdminPermission): boolean {
  return effectiveAdminPermissions(principal).includes(permission);
}

export function adminCanAll(
  principal: AdminPrincipal,
  permissions: readonly AdminPermission[],
): boolean {
  const effective = effectiveAdminPermissions(principal);
  return permissions.every((p) => effective.includes(p));
}

export function canGrantRole(actor: AdminRole, target: AdminRole): boolean {
  return GRANTABLE_ROLES[actor].includes(target);
}

export function isValidCustomAdminPermissions(
  permissions: readonly string[],
): permissions is AdminPermission[] {
  const allowed = new Set<string>(ADMIN_PERMISSIONS);
  return permissions.length > 0 && permissions.every((p) => allowed.has(p));
}
