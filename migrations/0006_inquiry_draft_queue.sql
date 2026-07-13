PRAGMA defer_foreign_keys = ON;

CREATE TABLE inquiry_ai_run_draft_links_v2 (
  ai_run_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL
);

INSERT INTO inquiry_ai_run_draft_links_v2 (ai_run_id, draft_id)
SELECT id, draft_id
FROM inquiry_ai_runs
WHERE draft_id IS NOT NULL;

CREATE TABLE inquiry_drafts_v2 (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'sending', 'sent', 'send_failed')),
  version INTEGER NOT NULL DEFAULT 1,
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

INSERT INTO inquiry_drafts_v2 (
  id,
  thread_id,
  message_id,
  status,
  to_address,
  to_address_hash,
  from_address,
  reply_to_address,
  subject,
  text_body,
  in_reply_to_hash,
  references_hash,
  created_by,
  approved_by,
  rejected_by,
  sent_by,
  sent_at,
  provider_message_id_hash,
  last_error_code,
  created_at,
  updated_at,
  version
)
SELECT
  id,
  thread_id,
  message_id,
  status,
  to_address,
  to_address_hash,
  from_address,
  reply_to_address,
  subject,
  text_body,
  in_reply_to_hash,
  references_hash,
  created_by,
  approved_by,
  rejected_by,
  sent_by,
  sent_at,
  provider_message_id_hash,
  last_error_code,
  created_at,
  updated_at,
  1
FROM inquiry_drafts;

DROP TABLE inquiry_drafts;
ALTER TABLE inquiry_drafts_v2 RENAME TO inquiry_drafts;

UPDATE inquiry_ai_runs
SET draft_id = (
  SELECT links.draft_id
  FROM inquiry_ai_run_draft_links_v2 AS links
  WHERE links.ai_run_id = inquiry_ai_runs.id
)
WHERE id IN (SELECT ai_run_id FROM inquiry_ai_run_draft_links_v2);

DROP TABLE inquiry_ai_run_draft_links_v2;

CREATE INDEX IF NOT EXISTS idx_inquiry_drafts_thread_updated
  ON inquiry_drafts(thread_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_drafts_status_updated
  ON inquiry_drafts(status, updated_at);

PRAGMA defer_foreign_keys = OFF;

INSERT INTO schema_migrations (version)
VALUES ('0006')
ON CONFLICT(version) DO NOTHING;
