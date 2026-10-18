-- ConAI initial core schema (Phase 1)
-- Applied with: wrangler d1 migrations apply conai [--local|--remote]
-- Conventions:
--   * timestamps are ISO-8601 UTC strings ('YYYY-MM-DDTHH:MM:SS.sssZ')
--   * booleans are INTEGER 0/1
--   * auth tables (better-auth) arrive in 0002_auth.sql; user_profiles.id matches auth user id

-- ── Platform settings (JSON values; admin-editable, KV-cached by API) ──────────
CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL, -- JSON-encoded
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  TEXT
);

-- ── Plan configuration (all product plans; editable from Admin) ────────────────
CREATE TABLE plan_configs (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  price_label            TEXT NOT NULL,
  daily_sparks           INTEGER CHECK (daily_sparks IS NULL OR daily_sparks >= 0),
  personal_storage_mb    INTEGER CHECK (personal_storage_mb IS NULL OR personal_storage_mb >= 0),
  team_storage_mb        INTEGER CHECK (team_storage_mb IS NULL OR team_storage_mb >= 0),
  max_team_members       INTEGER CHECK (max_team_members IS NULL OR max_team_members > 0),
  max_teams_per_account  INTEGER CHECK (max_teams_per_account IS NULL OR max_teams_per_account >= 0),
  requires_verification  INTEGER NOT NULL DEFAULT 0 CHECK (requires_verification IN (0, 1)),
  active                 INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order             INTEGER NOT NULL DEFAULT 0,
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO plan_configs
  (id, name, price_label, daily_sparks, personal_storage_mb, team_storage_mb,
   max_team_members, max_teams_per_account, requires_verification, sort_order)
VALUES
  ('personal',   'Personal',   'Free', 500,  500,  NULL, NULL, NULL, 0, 1),
  ('student',    'Student',    'Free', 700, 1024,  NULL, NULL, NULL, 1, 2),
  ('teams',      'Teams',      'Free', 1000, 500,  2048,    30,    5, 0, 3),
  ('enterprise', 'Enterprise', 'Contact', NULL, NULL, NULL, NULL, NULL, 0, 4);

-- ── User profiles (identity/auth lives in better-auth tables from 0002) ────────
CREATE TABLE user_profiles (
  id                 TEXT PRIMARY KEY,           -- = auth user id (Phase 2)
  username           TEXT NOT NULL UNIQUE,       -- @username without the '@'
  display_name       TEXT NOT NULL,
  avatar_url         TEXT,
  locale             TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'vi')),
  plan_id            TEXT NOT NULL DEFAULT 'personal' REFERENCES plan_configs(id),
  referral_code      TEXT NOT NULL UNIQUE,
  referred_by        TEXT,                        -- referrer profile id (never self)
  student_verified_at TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (length(username) BETWEEN 3 AND 30),
  CHECK (username NOT LIKE '%@%' AND username NOT LIKE '% %'),
  CHECK (referred_by IS NULL OR referred_by <> id)
);

CREATE INDEX idx_user_profiles_referred_by ON user_profiles (referred_by);
CREATE INDEX idx_user_profiles_plan ON user_profiles (plan_id);

-- ── Spark wallets (ONE per user — team membership never creates another) ───────
CREATE TABLE spark_wallets (
  user_id             TEXT PRIMARY KEY,
  balance             INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  daily_limit_override INTEGER CHECK (daily_limit_override IS NULL OR daily_limit_override >= 0),
  last_refill_at      TEXT NOT NULL,             -- last time the top-up was applied (ISO UTC)
  version             INTEGER NOT NULL DEFAULT 0,-- optimistic concurrency for atomic ops
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── Spark transaction ledger (append-only; signs: +credit, −debit) ─────────────
CREATE TABLE spark_transactions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
                  'usage', 'refill', 'reservation', 'settlement',
                  'refund', 'release', 'referral_reward', 'admin_adjust'
                )),
  amount        INTEGER NOT NULL,                -- signed change to the wallet
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  request_id    TEXT UNIQUE,                      -- idempotency key (NULL allowed)
  description   TEXT NOT NULL DEFAULT '',
  meta          TEXT NOT NULL DEFAULT '{}',      -- JSON (no secrets — SECURITY.md §9)
  actor         TEXT,                            -- admin user id for admin_adjust
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_spark_tx_user_created ON spark_transactions (user_id, created_at DESC);
CREATE INDEX idx_spark_tx_user_type ON spark_transactions (user_id, type);

-- Append-only enforcement at the database level
CREATE TRIGGER spark_transactions_no_update
BEFORE UPDATE ON spark_transactions
BEGIN
  SELECT RAISE(ABORT, 'spark_transactions is append-only');
END;

CREATE TRIGGER spark_transactions_no_delete
BEFORE DELETE ON spark_transactions
BEGIN
  SELECT RAISE(ABORT, 'spark_transactions is append-only');
END;

-- ── Seed default platform settings (JSON values) ───────────────────────────────
INSERT INTO platform_settings (key, value) VALUES
  ('sparks.pricing', json_object(
    'tokensPerSpark', 100,
    'inputWeight', 1,
    'outputWeight', 1,
    'visionWeight', 1.5,
    'searchOpCost', 2,
    'researchOpCost', 10
  )),
  ('sparks.failed_request_refund', json_object('mode', 'full')),
  ('uploads.limits', json_object(
    'maxImagesPerMessage', 2,
    'maxDocumentsPerMessage', 2,
    'maxPdfPages', 50,
    'maxImageMb', 10,
    'maxDocumentMb', 20
  )),
  ('referral.reward', json_object(
    'referrerSparks', 100,
    'refereeSparks', 100,
    'requireVerifiedEmail', true,
    'requireStudentApprovalForStudentPlan', true
  )),
  ('notifications.quiet_hours', json_object('enabled', false, 'start', '22:00', 'end', '07:00'));
