-- V1: three languages in one database (docs/v1-contracts.md, D5, D6).
--
-- Every exercise-keyed table gains a `language` column, and it is part of every
-- key: slugs are unique only within a language. Code is stored as files_json
-- (path -> content) because Go and JS exercises have arbitrary editor files,
-- not Rust's fixed lib.rs/main.rs pair.
--
-- Sessions store SHA-256(token), never the token: a leaked database cannot be
-- replayed as cookies.
--
-- The V1 deployment starts from an empty database, so the old tables are
-- dropped rather than migrated.

DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS progress;
DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,                -- hex SHA-256 of the cookie value
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
  language      TEXT NOT NULL CHECK (language IN ('go', 'js', 'rust')),
  exercise_slug TEXT NOT NULL,
  files_json    TEXT,                            -- NULL = starter
  status        TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | passed
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, language, exercise_slug)
);

CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language      TEXT NOT NULL CHECK (language IN ('go', 'js', 'rust')),
  exercise_slug TEXT NOT NULL,
  run_id        TEXT,
  kind          TEXT NOT NULL,                  -- run | test
  outcome       TEXT,
  exit_code     INTEGER,
  duration_ms   INTEGER,
  files_json    TEXT,                           -- what was executed (D5)
  output        TEXT,                           -- capped at 1 MB (D5)
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_attempts_user ON attempts(user_id, created_at);
CREATE INDEX idx_attempts_exercise ON attempts(user_id, language, exercise_slug, created_at);

CREATE TABLE snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language      TEXT NOT NULL CHECK (language IN ('go', 'js', 'rust')),
  exercise_slug TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('manual', 'passing')),
  files_json    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_snapshots_lookup ON snapshots(user_id, language, exercise_slug, created_at DESC);
CREATE UNIQUE INDEX idx_snapshots_passing
  ON snapshots(user_id, language, exercise_slug)
  WHERE kind = 'passing';
