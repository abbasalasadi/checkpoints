-- Initial schema. See docs/01-canonical.md.
--
-- Identity does NOT depend on the reboot01 JWT's claim names, which are unknown.
-- The backend performs the signin itself, so it already knows the identifier the
-- student typed; that is the key. reboot_user_id is best-effort enrichment and
-- may stay NULL forever without anything breaking.

CREATE TABLE users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier_normalized TEXT NOT NULL UNIQUE,   -- lowercased, trimmed login
  reboot_user_id        TEXT UNIQUE,            -- filled once a claim yields one
  claims_json           TEXT,                   -- last decoded payload, for discovery
  created_at            TEXT NOT NULL,
  last_login_at         TEXT NOT NULL
);

-- One row per login, not per user: a student may be signed in from several
-- devices at once, and logout revokes one session rather than all of them.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,                -- 256 bits of randomness, not a JWT
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  user_agent   TEXT,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE progress (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_slug TEXT NOT NULL,
  lib_rs        TEXT,
  main_rs       TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | passed
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, exercise_slug)
);

CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_slug TEXT NOT NULL,
  kind          TEXT NOT NULL,                  -- run | test
  exit_code     INTEGER,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_attempts_user ON attempts(user_id, created_at);

-- Container lifetimes. There is no bill to control here, so this is fairness and
-- capacity monitoring: is one student saturating the queue, and how close are we
-- to the concurrency cap.
CREATE TABLE runner_usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  seconds      INTEGER
);
