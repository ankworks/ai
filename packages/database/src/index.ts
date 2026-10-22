/**
 * Row types mirroring `migrations/*.sql` (D1 / SQLite).
 * The API uses parameterized statements only (`db.prepare(...).bind(...)`) — no string SQL.
 */

export const PLAN_IDS = ['personal', 'student', 'teams', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlatformSettingRow {
  key: string;
  value: string; // JSON-encoded
  updated_at: string;
  updated_by: string | null;
}

export interface PlanConfigRow {
  id: PlanId;
  name: string;
  price_label: string;
  daily_sparks: number | null;
  personal_storage_mb: number | null;
  team_storage_mb: number | null;
  max_team_members: number | null;
  max_teams_per_account: number | null;
  requires_verification: 0 | 1;
  active: 0 | 1;
  sort_order: number;
  updated_at: string;
}

export interface UserProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  locale: 'en' | 'vi';
  plan_id: PlanId;
  referral_code: string;
  referred_by: string | null;
  student_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SparkWalletRow {
  user_id: string;
  balance: number;
  daily_limit_override: number | null;
  last_refill_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export const SPARK_TRANSACTION_TYPES = [
  'usage',
  'refill',
  'reservation',
  'settlement',
  'refund',
  'release',
  'referral_reward',
  'admin_adjust',
] as const;
export type SparkTransactionType = (typeof SPARK_TRANSACTION_TYPES)[number];

export interface SparkTransactionRow {
  id: string;
  user_id: string;
  type: SparkTransactionType;
  amount: number; // signed: + credit, − debit
  balance_after: number;
  request_id: string | null;
  description: string;
  meta: string; // JSON — never contains secrets (SECURITY.md §9)
  actor: string | null;
  created_at: string;
}

/** Effective daily Sparks limit for a wallet given its plan row. */
export function effectiveDailyLimit(
  wallet: Pick<SparkWalletRow, 'daily_limit_override'>,
  plan: Pick<PlanConfigRow, 'daily_sparks'> | null | undefined,
): number {
  if (wallet.daily_limit_override !== null) return wallet.daily_limit_override;
  return plan?.daily_sparks ?? 0;
}

// ── Teams (Phase 5, migration 0005) ──────────────────────────────────

export interface TeamRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  modules: string; // JSON: moduleId -> 0/1
  created_at: string;
  updated_at: string;
}

export interface TeamRoleRow {
  id: string;
  team_id: string;
  name: string;
  permissions: string; // JSON array of TEAM_PERMISSIONS
  created_at: string;
}

export interface TeamMemberRow {
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  custom_role_id: string | null;
  joined_at: string;
}

export interface TeamInviteRow {
  id: string;
  team_id: string;
  invited_by: string;
  email: string | null;
  username: string | null;
  token: string;
  role: 'admin' | 'member' | 'viewer';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export interface TeamActivityRow {
  id: string;
  team_id: string;
  actor_id: string;
  type: string;
  meta: string; // JSON — no secrets
  created_at: string;
}

/** Owner-toggled workspace modules (PRODUCT_SPEC §12). */
export const TEAM_MODULES = [
  'overview',
  'projects',
  'tasks',
  'channels',
  'documents',
  'calendar',
  'activity',
  'members',
  'automations',
  'settings',
] as const;
export type TeamModuleId = (typeof TEAM_MODULES)[number];

/** Team activity event types written by the API (30-day retention). */
export const TEAM_ACTIVITY_TYPES = [
  'team.created',
  'team.updated',
  'team.deleted',
  'ownership.transferred',
  'member.joined',
  'member.removed',
  'member.role_changed',
  'invite.created',
  'invite.accepted',
  'invite.revoked',
] as const;
export type TeamActivityType = (typeof TEAM_ACTIVITY_TYPES)[number];

/** Stable keys seeded in 0001 — referenced by API and admin code. */
export const SETTING_KEYS = {
  sparksPricing: 'sparks.pricing',
  failedRequestRefund: 'sparks.failed_request_refund',
  uploadLimits: 'uploads.limits',
  referralReward: 'referral.reward',
  quietHours: 'notifications.quiet_hours',
} as const;

/** Parse a settings JSON value with a typed fallback. */
export function parseSetting<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
