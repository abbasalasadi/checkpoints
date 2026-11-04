-- V2: per-account editor and display preferences (D24), one JSON document per
-- user. The server validates and fills defaults; the column is never trusted raw.
CREATE TABLE preferences (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
