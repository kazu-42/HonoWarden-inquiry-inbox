PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiry_messages_mailbox_message_id_hash
  ON inquiry_messages(mailbox, message_id_hash)
  WHERE message_id_hash IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('0005')
ON CONFLICT(version) DO NOTHING;
