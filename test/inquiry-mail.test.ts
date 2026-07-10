import { describe, expect, it } from "vitest";

import { handleInquiryEmail, resolveAllowedMailbox } from "../src/inquiry-mail";
import {
  FakeEmailMessage,
  RecordingD1Database,
  attachmentEmail,
  textEmail,
} from "./support/fakes";

describe("inquiry email handler", () => {
  it("stores metadata-only records for allowed honowarden.com recipients", async () => {
    const database = new RecordingD1Database();
    const rawMessage = textEmail({
      body: "this private body must not be stored as a bound value",
    });
    const message = new FakeEmailMessage(
      "Reporter@Example.Test",
      "security@honowarden.com",
      rawMessage,
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_RETENTION_DAYS: "30",
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result).toMatchObject({
      status: "stored_metadata",
      mailbox: "security",
    });
    expect(message.rejectedReason).toBeNull();
    expect(message.forwardedTo).toBeNull();
    expect(database.queries.join("\n")).toContain(
      "INSERT INTO inquiry_threads",
    );
    expect(database.queries.join("\n")).toContain(
      "INSERT INTO inquiry_messages",
    );
    expect(database.queries.join("\n")).toContain("INSERT INTO inquiry_events");
    expect(database.boundValues).toContain("security");
    expect(database.boundValues).toContain("reporter@example.test");
    expect(database.boundValues).toContain("security@honowarden.com");
    expect(database.boundValues).toContain("2026-08-08T00:00:00.000Z");
    expect(database.boundValues).toContain("stored_metadata");
    expect(database.boundValues).toContain("disabled");
    expect(database.boundValues.join("\n")).not.toContain("private body");
  });

  it("forwards accepted metadata-only messages when a destination is configured", async () => {
    const database = new RecordingD1Database();
    const message = new FakeEmailMessage(
      "reporter@example.test",
      "hello@honowarden.com",
      textEmail({ to: "hello@honowarden.com" }),
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_FORWARD_TO: "operator@example.test",
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result.status).toBe("forwarded");
    expect(message.forwardedTo).toBe("operator@example.test");
    expect(database.boundValues).toContain("forward_pending");
    expect(database.boundValues).toContain("forward");
    expect(database.boundValues.join("\n")).not.toContain(
      "operator@example.test",
    );
  });

  it("uses mailbox-specific forwarding destinations before the generic fallback", async () => {
    const database = new RecordingD1Database();
    const message = new FakeEmailMessage(
      "reporter@example.test",
      "support@honowarden.com",
      textEmail({ to: "support@honowarden.com" }),
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_FORWARD_TO: "generic@example.test",
        HONOWARDEN_SUPPORT_FORWARD_TO: "support-operator@example.test",
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result.status).toBe("forwarded");
    expect(message.forwardedTo).toBe("support-operator@example.test");
    expect(database.boundValues.join("\n")).not.toContain(
      "support-operator@example.test",
    );
  });

  it("does not persist or forward a duplicate mailbox Message-ID", async () => {
    const database = new RecordingD1Database({
      id: "message_existing",
      thread_id: "thread_existing",
    });
    const message = new FakeEmailMessage(
      "reporter@example.test",
      "support@honowarden.com",
      textEmail({
        to: "support@honowarden.com",
        messageId: "<duplicate@example.test>",
      }),
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_SUPPORT_FORWARD_TO: "support-operator@example.test",
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result).toEqual({
      status: "duplicate",
      mailbox: "support",
      messageId: "message_existing",
      threadId: "thread_existing",
    });
    expect(message.forwardedTo).toBeNull();
    expect(database.queries.join("\n")).toContain(
      "WHERE mailbox = ? AND message_id_hash = ?",
    );
    expect(database.queries.join("\n")).not.toContain(
      "INSERT INTO inquiry_threads",
    );
    expect(database.queries.join("\n")).not.toContain(
      "INSERT INTO inquiry_messages",
    );
    expect(database.queries.join("\n")).not.toContain(
      "INSERT INTO inquiry_events",
    );
  });

  it("routes plus-addressed replies back to the existing thread id", async () => {
    const database = new RecordingD1Database();
    const message = new FakeEmailMessage(
      "reporter@example.test",
      "support+thread_existing@honowarden.com",
      textEmail({ to: "support+thread_existing@honowarden.com" }),
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result).toMatchObject({
      status: "stored_metadata",
      mailbox: "support",
      threadId: "thread_existing",
    });
    expect(database.boundValues).toContain("reply:thread_existing");
    expect(database.boundValues).toContain(
      "support+thread_existing@honowarden.com",
    );
  });

  it("rejects recipients outside the configured honowarden.com mailboxes", async () => {
    const database = new RecordingD1Database();
    const message = new FakeEmailMessage(
      "reporter@example.test",
      "sales@honowarden.com",
      textEmail({ to: "sales@honowarden.com" }),
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result).toEqual({
      status: "rejected_recipient",
      mailbox: null,
      messageId: null,
      threadId: null,
    });
    expect(message.rejectedReason).toContain("recipient");
    expect(database.queries).toEqual([]);
  });

  it("rejects attachments and records metadata without storing attachment content", async () => {
    const database = new RecordingD1Database();
    const message = new FakeEmailMessage(
      "reporter@example.test",
      "security@honowarden.com",
      attachmentEmail(),
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result.status).toBe("rejected_attachments");
    expect(message.rejectedReason).toContain("attachments");
    expect(database.boundValues).toContain("rejected_attachments");
    expect(database.boundValues).toContain("rejected");
    expect(database.boundValues).toContain(1);
    expect(database.boundValues.join("\n")).not.toContain("attachment body");
    expect(database.boundValues.join("\n")).not.toContain("secret.txt");
  });

  it("rejects messages above the configured size limit", async () => {
    const database = new RecordingD1Database();
    const message = new FakeEmailMessage(
      "reporter@example.test",
      "security@honowarden.com",
      textEmail({ body: "oversized" }),
    );

    const result = await handleInquiryEmail(
      message,
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_MAX_BYTES: "8",
      },
      new Date("2026-07-09T00:00:00.000Z"),
    );

    expect(result.status).toBe("rejected_size");
    expect(message.rejectedReason).toContain("size");
    expect(database.boundValues).toContain("rejected_size");
    expect(database.boundValues).toContain("not_inspected");
  });
});

describe("resolveAllowedMailbox", () => {
  it("accepts the default operational mailboxes only on honowarden.com", () => {
    expect(resolveAllowedMailbox("security@honowarden.com", undefined)).toBe(
      "security",
    );
    expect(
      resolveAllowedMailbox(
        "support+thread_existing@honowarden.com",
        undefined,
      ),
    ).toBe("support");
    expect(resolveAllowedMailbox("security@example.com", undefined)).toBeNull();
    expect(resolveAllowedMailbox("sales@honowarden.com", undefined)).toBeNull();
  });

  it("honors explicit mailbox configuration", () => {
    expect(resolveAllowedMailbox("triage@honowarden.com", "triage")).toBe(
      "triage",
    );
    expect(resolveAllowedMailbox("hello@honowarden.com", "triage")).toBeNull();
  });
});
