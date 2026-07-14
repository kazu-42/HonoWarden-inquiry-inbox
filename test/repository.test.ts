import { describe, expect, it } from "vitest";

import {
  recordInquiryEvent,
  recordInquiryMessage,
  updateInquiryMessageDeliveryStatus,
  upsertInquiryThread,
} from "../src/repository";
import { RecordingD1Database } from "./support/fakes";

describe("inquiry repository", () => {
  it("upserts threads by mailbox and thread key", async () => {
    const database = new RecordingD1Database();

    await upsertInquiryThread(database as unknown as D1Database, {
      id: "thread-id",
      mailbox: "security",
      threadKey: "ref:abc",
      sender: "reporter@example.test",
      senderHash: "sender-hash",
      subject: "Report",
      retentionDeleteAfter: "2027-07-09T00:00:00.000Z",
      latestMessageAt: "2026-07-09T00:00:00.000Z",
      now: "2026-07-09T00:00:00.000Z",
    });

    expect(database.queries.join("\n")).toContain(
      "ON CONFLICT(mailbox, thread_key) DO UPDATE SET",
    );
    expect(database.boundValues).toContain("thread-id");
    expect(database.boundValues).toContain("security");
    expect(database.boundValues).toContain("ref:abc");
  });

  it("stores message metadata and not raw message bodies", async () => {
    const database = new RecordingD1Database();

    await recordInquiryMessage(database as unknown as D1Database, {
      id: "message-id",
      threadId: "thread-id",
      mailbox: "security",
      direction: "inbound",
      envelopeSender: "reporter@example.test",
      envelopeSenderHash: "sender-hash",
      envelopeRecipient: "security@honowarden.com",
      headerMetadataJson: '{"names":["subject"]}',
      messageIdHash: "message-hash",
      subject: "Report",
      receivedAt: "2026-07-09T00:00:00.000Z",
      rawSizeBytes: 123,
      bodyMetadataJson: '{"storage":"metadata_only"}',
      attachmentCount: 0,
      attachmentPolicy: "rejected",
      rawStorageState: "disabled",
      rawR2Key: null,
      deliveryStatus: "stored_metadata",
      retentionDeleteAfter: "2027-07-09T00:00:00.000Z",
      createdAt: "2026-07-09T00:00:00.000Z",
    });

    expect(database.queries.join("\n")).toContain(
      "INSERT INTO inquiry_messages",
    );
    expect(database.boundValues).toContain("message-id");
    expect(database.boundValues.join("\n")).toContain("metadata_only");
    expect(database.boundValues.join("\n")).not.toContain("raw private body");
  });

  it("stores append-only inquiry events", async () => {
    const database = new RecordingD1Database();

    await recordInquiryEvent(database as unknown as D1Database, {
      id: "event-id",
      threadId: "thread-id",
      messageId: "message-id",
      eventType: "receive",
      status: "stored_metadata",
      metadataJson: "{}",
      occurredAt: "2026-07-09T00:00:00.000Z",
    });

    expect(database.queries.join("\n")).toContain("INSERT INTO inquiry_events");
    expect(database.boundValues).toContain("receive");
  });

  it("transitions only a pending forward to a terminal delivery status", async () => {
    const database = new RecordingD1Database();

    const updated = await updateInquiryMessageDeliveryStatus(
      database as unknown as D1Database,
      {
        id: "message-id",
        expectedStatus: "forward_pending",
        status: "forwarded",
      },
    );

    expect(updated).toBe(true);
    expect(database.queries.join("\n")).toContain("UPDATE inquiry_messages");
    expect(database.queries.join("\n")).toContain("delivery_status = ?");
    expect(database.queries.join("\n")).toContain("AND delivery_status = ?");
    expect(database.boundValues).toEqual([
      "forwarded",
      "message-id",
      "forward_pending",
    ]);
  });

  it("reports when the pending forward transition did not apply", async () => {
    const database = new RecordingD1Database(null, [], [0]);

    const updated = await updateInquiryMessageDeliveryStatus(
      database as unknown as D1Database,
      {
        id: "message-id",
        expectedStatus: "forward_pending",
        status: "forward_failed",
      },
    );

    expect(updated).toBe(false);
  });
});
