ALTER TABLE links
ADD COLUMN expires_at TEXT;
CREATE TABLE IF NOT EXISTS flags (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0
);
INSERT
  OR IGNORE INTO flags (name, enabled)
VALUES ('expiry', 0);