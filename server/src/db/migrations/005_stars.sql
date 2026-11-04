-- V2: private stars (D24) — a student's own bookmarks, never shown to others.
CREATE TABLE stars (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language      TEXT NOT NULL,
  exercise_slug TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, language, exercise_slug)
);
