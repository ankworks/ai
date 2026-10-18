-- ConAI Phase 4 — AI conversation history, Smart Memory, prompt library.
-- Conventions match 0001: ISO-8601 UTC timestamps, INTEGER booleans,
-- app-level user integrity (no FK into better-auth tables — they arrive in 0002
-- and deletion flows clean up application-side, same as user_profiles/wallets).

-- ── Conversations (one chat thread per user; Personal scope only in Phase 4) ──
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  tool            TEXT CHECK (tool IS NULL OR tool IN ('study', 'coding', 'writing', 'documents', 'tools')),
  model           TEXT,                      -- last manually chosen model (NULL = ConAI Auto)
  pinned          INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  message_count   INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_conversations_user ON conversations (user_id, pinned DESC, updated_at DESC);

-- ── Messages (persisted only AFTER a successful settlement — history = value) ─
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  model           TEXT,                       -- assistant: model actually used
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  sparks          INTEGER,                    -- charged for this assistant turn
  finish_reason   TEXT,
  error_code      TEXT,                       -- non-null when the run errored mid-stream
  request_id      TEXT,                       -- gateway requestId (traceable to ledger)
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_user ON messages (user_id);

-- ── Smart Memory (opt-in; NOTHING reaches the prompt without approval) ───────
CREATE TABLE user_memories (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  content           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'suggested'
                      CHECK (status IN ('suggested', 'approved', 'rejected')),
  enabled           INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  source            TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'model')),
  source_message_id TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_user_memories_user ON user_memories (user_id, status, enabled);

-- ── Prompt library (user-owned saved prompts) ────────────────────────────────
CREATE TABLE prompt_library (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_prompt_library_user ON prompt_library (user_id, updated_at DESC);
