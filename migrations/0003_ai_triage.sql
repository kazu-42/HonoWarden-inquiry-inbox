PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inquiry_ai_runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  draft_id TEXT,
  prompt_version TEXT NOT NULL,
  model_id TEXT NOT NULL,
  redacted_context_json TEXT NOT NULL,
  classification TEXT NOT NULL,
  confidence REAL NOT NULL,
  recommended_action TEXT NOT NULL,
  requires_human_approval INTEGER NOT NULL,
  tool_calls_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES inquiry_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES inquiry_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (draft_id) REFERENCES inquiry_drafts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inquiry_ai_runs_thread_created
  ON inquiry_ai_runs(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_ai_runs_classification_created
  ON inquiry_ai_runs(classification, created_at);

INSERT INTO schema_migrations (version)
VALUES ('0003')
ON CONFLICT(version) DO NOTHING;
