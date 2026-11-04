-- V3 step 7 (D30–D33): Java joins the language list.
--
-- SQLite cannot alter a CHECK constraint, so the three tables that carry one
-- (003) are rebuilt: create the new table, copy every row, drop the old one,
-- rename, re-create the indexes. The runner applies this file in one
-- transaction, so a failure leaves the old tables untouched. Nothing references
-- these tables, so dropping them does not disturb foreign keys.
-- attempts keeps exam_id (006) at the end, as ALTER TABLE left it.

CREATE TABLE progress_new (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language      TEXT NOT NULL CHECK (language IN ('go', 'js', 'rust', 'java')),
  exercise_slug TEXT NOT NULL,
  files_json    TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress',
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, language, exercise_slug)
);
INSERT INTO progress_new (user_id, language, exercise_slug, files_json, status, updated_at)
  SELECT user_id, language, exercise_slug, files_json, status, updated_at FROM progress;
DROP TABLE progress;
ALTER TABLE progress_new RENAME TO progress;

CREATE TABLE attempts_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language      TEXT NOT NULL CHECK (language IN ('go', 'js', 'rust', 'java')),
  exercise_slug TEXT NOT NULL,
  run_id        TEXT,
  kind          TEXT NOT NULL,
  outcome       TEXT,
  exit_code     INTEGER,
  duration_ms   INTEGER,
  files_json    TEXT,
  output        TEXT,
  created_at    TEXT NOT NULL,
  exam_id       INTEGER
);
INSERT INTO attempts_new (id, user_id, language, exercise_slug, run_id, kind, outcome, exit_code, duration_ms, files_json, output, created_at, exam_id)
  SELECT id, user_id, language, exercise_slug, run_id, kind, outcome, exit_code, duration_ms, files_json, output, created_at, exam_id FROM attempts;
DROP TABLE attempts;
ALTER TABLE attempts_new RENAME TO attempts;
CREATE INDEX idx_attempts_user ON attempts(user_id, created_at);
CREATE INDEX idx_attempts_exercise ON attempts(user_id, language, exercise_slug, created_at);

CREATE TABLE snapshots_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language      TEXT NOT NULL CHECK (language IN ('go', 'js', 'rust', 'java')),
  exercise_slug TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('manual', 'passing')),
  files_json    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
INSERT INTO snapshots_new (id, user_id, language, exercise_slug, kind, files_json, created_at)
  SELECT id, user_id, language, exercise_slug, kind, files_json, created_at FROM snapshots;
DROP TABLE snapshots;
ALTER TABLE snapshots_new RENAME TO snapshots;
CREATE INDEX idx_snapshots_lookup ON snapshots(user_id, language, exercise_slug, created_at DESC);
CREATE UNIQUE INDEX idx_snapshots_passing
  ON snapshots(user_id, language, exercise_slug)
  WHERE kind = 'passing';
