-- Spreadsheet link made easy:
--  kind 'google': the user allowed REPS (drive.file only) and picked or created a sheet; refresh_token is sealed with AES-GCM.
--  kind 'script': the original Apps Script web app link (url + token).
ALTER TABLE sheet_links ADD COLUMN kind TEXT NOT NULL DEFAULT 'script';
ALTER TABLE sheet_links ADD COLUMN spreadsheet_id TEXT;
ALTER TABLE sheet_links ADD COLUMN title TEXT;
ALTER TABLE sheet_links ADD COLUMN refresh_token TEXT;

-- A private CSV address for =IMPORTDATA(...). Anyone with the token can read the records, so it can be renewed or stopped.
CREATE TABLE IF NOT EXISTS sheet_feeds (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
