-- V3: mock exams (D7, D27, D28). An exam is one random exercise per level of a
-- checkpoint, worked from pristine starters. Exam code lives here, never in
-- progress, so the student's practice drafts stay set aside on the server and
-- an exam pass never marks practice progress (D27).
CREATE TABLE exams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language    TEXT NOT NULL,
  checkpoint  TEXT NOT NULL,
  minutes     INTEGER NOT NULL,
  started_at  TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  ended_at    TEXT,
  status      TEXT NOT NULL DEFAULT 'active'   -- active | finished | abandoned | expired
);
CREATE INDEX idx_exams_user ON exams(user_id, started_at);

CREATE TABLE exam_items (
  exam_id       INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  level         INTEGER NOT NULL,
  exercise_slug TEXT NOT NULL,
  files_json    TEXT,
  submits       INTEGER NOT NULL DEFAULT 0,
  passed_at     TEXT,
  PRIMARY KEY (exam_id, exercise_slug)
);

ALTER TABLE attempts ADD COLUMN exam_id INTEGER;
