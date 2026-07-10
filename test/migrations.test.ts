import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("migrations/0001_inquiry_mailbox.sql", "utf8");
const replyMigration = readFileSync(
  "migrations/0002_inquiry_replies.sql",
  "utf8",
);
const aiMigration = readFileSync("migrations/0003_ai_triage.sql", "utf8");
const linearMigration = readFileSync(
  "migrations/0004_linear_links.sql",
  "utf8",
);
const idempotencyMigration = readFileSync(
  "migrations/0005_inbound_idempotency.sql",
  "utf8",
);

describe("inquiry mailbox migration", () => {
  it("creates metadata, message, and event tables", () => {
    for (const tableName of [
      "schema_migrations",
      "inquiry_threads",
      "inquiry_messages",
      "inquiry_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  it("records retention and delivery metadata without body columns", () => {
    expect(migration).toContain("retention_delete_after TEXT NOT NULL");
    expect(migration).toContain("delivery_status TEXT NOT NULL");
    expect(migration).toContain("body_metadata_json TEXT NOT NULL");
    expect(migration).toContain("header_metadata_json TEXT NOT NULL");
    expect(migration).toContain("attachment_policy TEXT NOT NULL");
    expect(migration).not.toContain("body TEXT");
    expect(migration).not.toContain("attachment_body");
  });

  it("indexes mailbox and retention lookups", () => {
    for (const indexName of [
      "idx_inquiry_threads_mailbox_updated",
      "idx_inquiry_threads_retention",
      "idx_inquiry_messages_mailbox_received",
      "idx_inquiry_messages_retention",
      "idx_inquiry_events_thread_occurred",
    ]) {
      expect(migration).toContain(`CREATE INDEX IF NOT EXISTS ${indexName}`);
    }
  });

  it("adds human-approved reply drafts without API key columns", () => {
    expect(replyMigration).toContain(
      "CREATE TABLE IF NOT EXISTS inquiry_drafts",
    );
    expect(replyMigration).toContain(
      "status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'sent', 'send_failed'))",
    );
    expect(replyMigration).toContain("approved_by TEXT");
    expect(replyMigration).toContain("sent_at TEXT");
    expect(replyMigration).toContain("provider_message_id_hash TEXT");
    expect(replyMigration).toContain(
      "CREATE INDEX IF NOT EXISTS idx_inquiry_drafts_thread_updated",
    );
    expect(replyMigration).not.toContain("api_key");
    expect(replyMigration).not.toContain("token");
  });

  it("adds redacted AI triage run metadata", () => {
    expect(aiMigration).toContain("CREATE TABLE IF NOT EXISTS inquiry_ai_runs");
    expect(aiMigration).toContain("redacted_context_json TEXT NOT NULL");
    expect(aiMigration).toContain("classification TEXT NOT NULL");
    expect(aiMigration).toContain("confidence REAL NOT NULL");
    expect(aiMigration).toContain("tool_calls_json TEXT NOT NULL");
    expect(aiMigration).toContain(
      "CREATE INDEX IF NOT EXISTS idx_inquiry_ai_runs_thread_created",
    );
    expect(aiMigration).not.toContain("raw_body");
    expect(aiMigration).not.toContain("api_key");
    expect(aiMigration).not.toContain("token TEXT");
  });

  it("adds redacted Linear issue link records without token storage", () => {
    expect(linearMigration).toContain(
      "CREATE TABLE IF NOT EXISTS inquiry_linear_links",
    );
    expect(linearMigration).toContain("redacted_summary TEXT NOT NULL");
    expect(linearMigration).toContain("linear_issue_url TEXT");
    expect(linearMigration).toContain("UNIQUE(thread_id)");
    expect(linearMigration).toContain(
      "CREATE INDEX IF NOT EXISTS idx_inquiry_linear_links_status_updated",
    );
    expect(linearMigration).not.toContain("api_key");
    expect(linearMigration).not.toContain("token");
    expect(linearMigration).not.toContain("raw_body");
  });

  it("deduplicates inbound Message-ID hashes per mailbox", () => {
    expect(idempotencyMigration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiry_messages_mailbox_message_id_hash",
    );
    expect(idempotencyMigration).toContain("mailbox, message_id_hash");
    expect(idempotencyMigration).toContain("message_id_hash IS NOT NULL");
    expect(idempotencyMigration).not.toContain("message_id TEXT");
  });
});
