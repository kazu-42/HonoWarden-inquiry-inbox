PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inquiry_linear_links (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'created', 'failed')),
  mailbox TEXT NOT NULL,
  title TEXT NOT NULL,
  redacted_summary TEXT NOT NULL,
  linear_issue_id TEXT,
  linear_issue_identifier TEXT,
  linear_issue_url TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(thread_id),
  FOREIGN KEY (thread_id) REFERENCES inquiry_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES inquiry_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inquiry_linear_links_status_updated
  ON inquiry_linear_links(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_linear_links_issue_identifier
  ON inquiry_linear_links(linear_issue_identifier);

INSERT INTO schema_migrations (version)
VALUES ('0004')
ON CONFLICT(version) DO NOTHING;
