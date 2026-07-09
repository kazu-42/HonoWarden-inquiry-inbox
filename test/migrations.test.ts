import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("migrations/0001_inquiry_mailbox.sql", "utf8");

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
});
