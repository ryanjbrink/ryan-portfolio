-- Geo + bot fields (safe to re-run; ignore "duplicate column" errors)

ALTER TABLE sessions ADD COLUMN country TEXT;
ALTER TABLE sessions ADD COLUMN city TEXT;
ALTER TABLE sessions ADD COLUMN region TEXT;
ALTER TABLE sessions ADD COLUMN latitude REAL;
ALTER TABLE sessions ADD COLUMN longitude REAL;
ALTER TABLE sessions ADD COLUMN is_bot INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN as_org TEXT;

ALTER TABLE ip_visitors ADD COLUMN country TEXT;
ALTER TABLE ip_visitors ADD COLUMN city TEXT;
ALTER TABLE ip_visitors ADD COLUMN region TEXT;
ALTER TABLE ip_visitors ADD COLUMN latitude REAL;
ALTER TABLE ip_visitors ADD COLUMN longitude REAL;
ALTER TABLE ip_visitors ADD COLUMN is_bot INTEGER DEFAULT 0;

ALTER TABLE ip_visit_log ADD COLUMN country TEXT;
ALTER TABLE ip_visit_log ADD COLUMN city TEXT;
ALTER TABLE ip_visit_log ADD COLUMN region TEXT;
ALTER TABLE ip_visit_log ADD COLUMN latitude REAL;
ALTER TABLE ip_visit_log ADD COLUMN longitude REAL;
ALTER TABLE ip_visit_log ADD COLUMN is_bot INTEGER DEFAULT 0;
