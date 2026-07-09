PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inquiry_threads (
  id TEXT PRIMARY KEY,
  mailbox TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_hash TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  retention_delete_after TEXT NOT NULL,
  latest_message_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (mailbox, thread_key)
);

CREATE INDEX IF NOT EXISTS idx_inquiry_threads_mailbox_updated
  ON inquiry_threads(mailbox, updated_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_threads_retention
  ON inquiry_threads(retention_delete_after);

CREATE TABLE IF NOT EXISTS inquiry_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  mailbox TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  envelope_sender TEXT NOT NULL,
  envelope_sender_hash TEXT NOT NULL,
  envelope_recipient TEXT NOT NULL,
  header_metadata_json TEXT NOT NULL,
  message_id_hash TEXT,
  subject TEXT,
  received_at TEXT NOT NULL,
  raw_size_bytes INTEGER NOT NULL,
  body_metadata_json TEXT NOT NULL,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachment_policy TEXT NOT NULL,
  raw_storage_state TEXT NOT NULL,
  raw_r2_key TEXT,
  delivery_status TEXT NOT NULL,
  retention_delete_after TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES inquiry_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_thread_received
  ON inquiry_messages(thread_id, received_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_mailbox_received
  ON inquiry_messages(mailbox, received_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_retention
  ON inquiry_messages(retention_delete_after);

CREATE TABLE IF NOT EXISTS inquiry_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  message_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES inquiry_threads(id) ON DELETE SET NULL,
  FOREIGN KEY (message_id) REFERENCES inquiry_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inquiry_events_thread_occurred
  ON inquiry_events(thread_id, occurred_at);

INSERT INTO schema_migrations (version)
VALUES ('0001')
ON CONFLICT(version) DO NOTHING;
