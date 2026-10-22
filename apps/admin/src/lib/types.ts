/** DTOs mirroring the `/api/admin/*` responses (apps/api/src/routes/admin.ts). */

export interface AdminMe {
  admin: {
    userId: string;
    email: string;
    name: string;
    role: string;
    permissions: readonly string[];
    customPermissions: readonly string[] | null;
    mfaEnrolled: boolean;
    status: 'active' | 'locked';
  };
}

export interface DashboardCounts {
  counts: {
    users: number;
    bannedUsers: number;
    teams: number;
    files: number;
    conversations: number;
    messages: number;
    sparksInCirculation: number;
    admins: number;
    auditEventsLast24h: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  username: string | null;
  emailVerified: number;
  banned: number;
  twoFactorEnabled: number;
  createdAt: string;
  display_name: string | null;
  plan_id: string | null;
  locale: string | null;
  balance: number | null;
  is_admin: number;
}

export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminRosterRow {
  user_id: string;
  role: string;
  custom_permissions: string | null;
  status: 'active' | 'locked';
  mfa_enrolled: number;
  created_at: string;
  email: string;
  name: string;
  twoFactorEnabled: number;
}

export interface AdminAuditEvent {
  id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AdminAuditPage {
  events: AdminAuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface PlatformSettingRow {
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminSettings {
  settings: PlatformSettingRow[];
  editableKeys: string[];
}
