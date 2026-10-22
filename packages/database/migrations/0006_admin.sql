-- ConAI admin plane (Phase 6) — separate admin sessions with mandatory MFA.
--
-- Two better-auth instances share the auth core tables (user/session/account):
--   * user-plane instance: cookie prefix `conai`
--   * admin instance:      cookie prefix `conai_admin`, basePath /api/admin-auth
-- The twoFactor tables/columns below back the admin instance's TOTP plugin
-- (better-auth 1.7.10 two-factor plugin schema — names are plugin-owned).

-- ── User-level flags consumed by BOTH auth instances ──────────────────────────
-- banned=1 blocks every new session (user-plane and admin-plane); existing
-- sessions expire naturally and are rejected by the admin guard on next use.
ALTER TABLE "user" ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
-- Added by the two-factor plugin's user schema extension (input:false, server-managed).
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" INTEGER NOT NULL DEFAULT 0;

-- ── better-auth two-factor plugin storage (TOTP secrets + backup codes) ───────
-- No createdAt/updatedAt: the two-factor plugin's model disables timestamps,
-- so better-auth never writes them (its schema validator rejects NOT NULL ones).
CREATE TABLE "twoFactor" (
  "id"                      TEXT NOT NULL PRIMARY KEY,
  "secret"                  TEXT NOT NULL,
  "backupCodes"             TEXT NOT NULL,
  "userId"                  TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "verified"                INTEGER NOT NULL DEFAULT 0,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"             DATE
);

CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");

-- ── Admin roster ──────────────────────────────────────────────────────────────
-- A user becomes an admin ONLY by appearing here. The first Owner is bootstrapped
-- from ADMIN_OWNER_EMAILS on first admin sign-in; there is no self-serve signup.
CREATE TABLE admin_members (
  user_id             TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (
                        role IN ('owner','administrator','moderator',
                                 'student_reviewer','ai_manager','support_agent')
                      ),
  -- JSON array of admin.* permissions; when non-null it OVERRIDES the role set.
  custom_permissions  TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
  -- 1 once an admin has a verified TOTP factor (mirrors user.twoFactorEnabled;
  -- the live column remains the enforcement source, this is for UI/audit).
  mfa_enrolled        INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  created_by          TEXT
);

-- ── Immutable admin audit trail (every admin-plane mutation) ──────────────────
CREATE TABLE admin_audit_log (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL,
  actor_name    TEXT,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  metadata      TEXT, -- JSON, never contains secrets or password material
  ip_address    TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX admin_audit_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_actor_idx   ON admin_audit_log (actor_id);
CREATE INDEX admin_audit_action_idx  ON admin_audit_log (action);
