-- ConAI Phase 5 — Teams (ARCHITECTURE §12, PRODUCT_SPEC §12)
-- Limits are plan-driven and enforced server-side from plan_configs:
--   max_teams_per_account (5 on TEAMS) · max_team_members (30/team on TEAMS)
-- No wallet rows here: one wallet per user, team membership never creates one
-- (PRODUCT_SPEC §6). AI inside teams spends the CALLING user's Sparks.

CREATE TABLE teams (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  owner_id   TEXT NOT NULL,
  modules    TEXT NOT NULL DEFAULT '{}',  -- JSON: moduleId -> 0/1 (owner-toggled)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Custom roles: explicit permission lists (built-ins live in @conai/permissions).
CREATE TABLE team_roles (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',  -- JSON array of TEAM_PERMISSIONS
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (team_id, name)
);
CREATE INDEX idx_team_roles_team ON team_roles (team_id);

CREATE TABLE team_members (
  team_id        TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  custom_role_id TEXT,                     -- when set, its permissions replace the built-in set
  joined_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members (user_id, team_id);

-- Invites: link (token only), email (must match on accept), @username (must match).
CREATE TABLE team_invites (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  invited_by  TEXT NOT NULL,
  email       TEXT,                        -- lower-cased when present
  username    TEXT,                        -- without '@'
  token       TEXT NOT NULL UNIQUE,        -- unguessable; also used for link invites
  role        TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('admin', 'member', 'viewer')),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  accepted_at TEXT,
  accepted_by TEXT
);
CREATE INDEX idx_team_invites_team ON team_invites (team_id, status);

-- Team activity log — 30-day retention (PRODUCT_SPEC §18), swept on read/write.
CREATE TABLE team_activity (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL,
  actor_id   TEXT NOT NULL,
  type       TEXT NOT NULL,
  meta       TEXT NOT NULL DEFAULT '{}',  -- JSON (no secrets — SECURITY.md §9)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_team_activity_team ON team_activity (team_id, created_at DESC);
