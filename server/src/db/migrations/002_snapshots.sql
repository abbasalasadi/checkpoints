-- Saved copies of a student's code, beyond the working copy in `progress`.
--
-- A separate table rather than more columns on `progress`: adding
-- saved_lib_rs / passed_lib_rs / … would be six code columns on one row, and a
-- fourth kind or a longer history would mean another migration each time. Here
-- every kind shares one shape and "keep more of them" is a data change.
--
--   manual   the student pressed Save. Several are kept, so saving again never
--            destroys the previous one.
--   passing  written automatically when Submit passes. One per exercise,
--            overwritten each time — the last known-good is the useful one.
--
-- The working copy stays in `progress`: it is what Run and Submit execute, and
-- what a page load restores.

CREATE TABLE snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_slug TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('manual', 'passing')),
  lib_rs        TEXT,
  main_rs       TEXT,
  created_at    TEXT NOT NULL
);

-- Every read is "this student's snapshots for this exercise, newest first".
CREATE INDEX idx_snapshots_lookup ON snapshots(user_id, exercise_slug, created_at DESC);

-- At most one passing snapshot per exercise; manual ones are pruned in code.
CREATE UNIQUE INDEX idx_snapshots_passing
  ON snapshots(user_id, exercise_slug)
  WHERE kind = 'passing';
