-- Keep in sync with SCHEMA in backend/index.js (the Worker also creates these on first request).
-- Databases from the single-task (guitar) version are migrated automatically by the Worker.

-- Parent-configured daily tasks. `template` picks the task type (see TEMPLATES in index.js),
-- `params` holds that template's own settings as JSON, e.g. instrument: {"durationMinutes":10,"micLevel":1}
CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  template       TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  params         TEXT    NOT NULL DEFAULT '{}',
  scheduled_days TEXT    NOT NULL DEFAULT '[1,2,3,4,5]',   -- JSON, 0=Sun … 6=Sat
  enabled        INTEGER NOT NULL DEFAULT 1,
  allow_manual   INTEGER NOT NULL DEFAULT 1,               -- 1 = child may tick it off by hand
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per task per completed day (date is local, YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS task_logs (
  task_id      INTEGER NOT NULL,
  date         TEXT    NOT NULL,
  completed_at TEXT    NOT NULL DEFAULT (datetime('now')),
  seconds      INTEGER NOT NULL DEFAULT 0,
  manual       INTEGER NOT NULL DEFAULT 0,                 -- 1 = ticked off by hand
  PRIMARY KEY (task_id, date)
);

-- In-progress timed work for the day, so the child can resume after closing the app
CREATE TABLE IF NOT EXISTS task_progress (
  task_id    INTEGER NOT NULL,
  date       TEXT    NOT NULL,
  seconds    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, date)
);

-- One recorded session per task per day. The audio itself is in R2 (AUDIO bucket, key "taskId/date");
-- `audio` only holds recordings saved before the move to R2 (empty for new ones)
CREATE TABLE IF NOT EXISTS task_recordings (
  task_id    INTEGER NOT NULL,
  date       TEXT    NOT NULL,
  mime_type  TEXT    NOT NULL,
  audio      BLOB    NOT NULL DEFAULT x'',
  bytes      INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, date)
);

-- Photo evidence: one JPEG per photo task per day (stored inline; move to R2 if photos get large)
CREATE TABLE IF NOT EXISTS task_photos (
  task_id    INTEGER NOT NULL,
  date       TEXT    NOT NULL,
  image      BLOB    NOT NULL,
  bytes      INTEGER NOT NULL,
  taken_on   TEXT    NOT NULL,                             -- date the photo was taken (EXIF or file time)
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, date)
);

-- Parent PIN (salted SHA-256) with brute-force lockout
CREATE TABLE IF NOT EXISTS parent_pin (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  salt         TEXT,
  hash         TEXT,
  failed       INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO parent_pin (id) VALUES (1);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
