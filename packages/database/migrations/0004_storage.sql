-- ConAI Phase 4 — file metadata for the personal Library (Phase-1 `FileMeta` shape).
-- Object bytes live in Backblaze B2 (S3-compatible, private buckets) — Workers
-- never proxy file bytes: clients upload via presigned PUT straight to B2.
-- `storage_key` is a random UUID path (never user-controlled — SECURITY.md §10).

CREATE TABLE files (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'personal'
                CHECK (scope IN ('personal', 'team', 'verification', 'temp')),
  team_id     TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'document')),
  filename    TEXT NOT NULL,                 -- sanitized display name
  storage_key TEXT NOT NULL,                 -- '<userId>/<uuid>/<safe-name>'
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL CHECK (size_bytes >= 0),
  page_count  INTEGER,                       -- PDF page count (enforced when doc ingest ships)
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'stored')),  -- pending = presigned, upload unconfirmed
  created_at  TEXT NOT NULL,
  stored_at   TEXT
);
CREATE INDEX idx_files_owner ON files (owner_id, created_at DESC);
-- Unique storage keys: a duplicate row can never double-count quota.
CREATE UNIQUE INDEX idx_files_storage_key ON files (storage_key);
