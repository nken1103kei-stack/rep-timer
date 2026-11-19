-- A user's own Google Sheets link (Apps Script web app) that receives their records. The token is their shared secret with the script.
CREATE TABLE IF NOT EXISTS sheet_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  token TEXT NOT NULL,
  last_ok_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);
