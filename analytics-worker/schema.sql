CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  referrer TEXT,
  landing_path TEXT,
  device TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  visitor_id TEXT
);

-- Existing D1 DBs: run once
-- ALTER TABLE sessions ADD COLUMN visitor_id TEXT;

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  path TEXT,
  title TEXT,
  meta TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

-- IP visit ledger (one row per new session; visit_n is running total for that IP)
CREATE TABLE IF NOT EXISTS ip_visitors (
  ip TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  visits INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ip_visit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL,
  visit_n INTEGER NOT NULL,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ip_visit_log_ts ON ip_visit_log(ts);
CREATE INDEX IF NOT EXISTS idx_ip_visit_log_ip ON ip_visit_log(ip);
