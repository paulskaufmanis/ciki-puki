-- Single-row settings table (id is always 1)
CREATE TABLE IF NOT EXISTS settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  task_enabled     INTEGER NOT NULL DEFAULT 1,               -- 1 = guitar task ON
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  scheduled_days   TEXT    NOT NULL DEFAULT '[1,2,3,4,5]',   -- JSON, 0=Sun … 6=Sat
  override         TEXT    NOT NULL DEFAULT 'none'
                   CHECK (override IN ('none','lock','unlock')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

-- One row per completed day (date is local, YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS daily_logs (
  date             TEXT PRIMARY KEY,
  completed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  seconds_practiced INTEGER NOT NULL DEFAULT 0
);

-- One recorded practice session per day
CREATE TABLE IF NOT EXISTS recordings (
  date       TEXT PRIMARY KEY,
  mime_type  TEXT NOT NULL,
  audio      BLOB NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
