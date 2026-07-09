PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inquiry_drafts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'sent', 'send_failed')),
  to_address TEXT NOT NULL,
  to_address_hash TEXT NOT NULL,
  from_address TEXT NOT NULL,
  reply_to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  in_reply_to_hash TEXT,
  references_hash TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  rejected_by TEXT,
  sent_by TEXT,
  sent_at TEXT,
  provider_message_id_hash TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES inquiry_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES inquiry_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inquiry_drafts_thread_updated
  ON inquiry_drafts(thread_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_drafts_status_updated
  ON inquiry_drafts(status, updated_at);

INSERT INTO schema_migrations (version)
VALUES ('0002')
ON CONFLICT(version) DO NOTHING;
