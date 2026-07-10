import { describe, expect, it } from "vitest";

import worker from "../src/index";
import type { InquiryBindings } from "../src/bindings";
import { RecordingD1Database } from "./support/fakes";

describe("human-approved inquiry replies", () => {
  it("does not trust a forwarded identity header in production", async () => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts",
        {
          threadId: "thread_1",
          to: "reporter@example.test",
          from: "support@honowarden.com",
          subject: "Re: Support",
          text: "safe reply body",
        },
        { "Cf-Access-Authenticated-User-Email": "spoofed@example.test" },
      ),
      {
        HONOWARDEN_INQUIRY_ENV: "production",
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "access_not_configured",
    });
    expect(database.queries).toEqual([]);
  });

  it("requires an Access identity before draft mutation", async () => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      jsonRequest("/api/drafts", {
        threadId: "thread_1",
        messageId: "message_1",
        to: "reporter@example.test",
        from: "support@honowarden.com",
        subject: "Re: Support",
        text: "safe reply body",
      }),
      {
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );

    expect(response.status).toBe(401);
    expect(database.queries).toEqual([]);
  });

  it("creates draft replies without echoing the draft body", async () => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts",
        {
          threadId: "thread_1",
          messageId: "message_1",
          to: "reporter@example.test",
          from: "support@honowarden.com",
          subject: "Re: Support",
          text: "safe reply body",
        },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );

    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      draft: {
        status: "draft",
        threadId: "thread_1",
        messageId: "message_1",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("safe reply body");
    expect(database.queries.join("\n")).toContain("INSERT INTO inquiry_drafts");
    expect(database.boundValues).toContain("operator@example.test");
    expect(database.boundValues).toContain("safe reply body");
  });

  it("edits draft replies only while they are still drafts", async () => {
    const database = new RecordingD1Database({
      id: "draft_1",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "draft",
      to_address: "reporter@example.test",
      from_address: "support@honowarden.com",
      reply_to_address: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text_body: "old reply body",
      in_reply_to_hash: null,
      references_hash: null,
    });

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1",
        {
          subject: "Re: Updated support",
          text: "updated reply body",
          to: "updated-reporter@example.test",
          from: "hello@honowarden.com",
        },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
        "PATCH",
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      draft: {
        id: "draft_1",
        status: "draft",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("updated reply body");
    expect(JSON.stringify(payload)).not.toContain(
      "updated-reporter@example.test",
    );
    expect(database.queries.join("\n")).toContain("UPDATE inquiry_drafts SET");
    expect(database.boundValues).toContain("updated-reporter@example.test");
    expect(database.boundValues).toContain("hello@honowarden.com");
    expect(database.boundValues).toContain("hello+thread_1@honowarden.com");
    expect(database.boundValues).toContain("Re: Updated support");
    expect(database.boundValues).toContain("updated reply body");
  });

  it("records explicit approval and rejection decisions", async () => {
    const approvalDatabase = new RecordingD1Database({
      id: "draft_1",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "draft",
      to_address: "reporter@example.test",
      from_address: "support@honowarden.com",
      reply_to_address: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text_body: "reply body",
      in_reply_to_hash: null,
      references_hash: null,
    });
    const rejectionDatabase = new RecordingD1Database({
      id: "draft_2",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "draft",
      to_address: "reporter@example.test",
      from_address: "support@honowarden.com",
      reply_to_address: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text_body: "reply body",
      in_reply_to_hash: null,
      references_hash: null,
    });

    const approved = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/approve",
        {},
        { "Cf-Access-Authenticated-User-Email": "approver@example.test" },
      ),
      {
        INQUIRY_DB: approvalDatabase as unknown as D1Database,
      } as InquiryBindings,
    );
    const rejected = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_2/reject",
        {},
        { "Cf-Access-Authenticated-User-Email": "reviewer@example.test" },
      ),
      {
        INQUIRY_DB: rejectionDatabase as unknown as D1Database,
      } as InquiryBindings,
    );

    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({
      draft: { id: "draft_1", status: "approved" },
    });
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({
      draft: { id: "draft_2", status: "rejected" },
    });
    expect(approvalDatabase.boundValues).toContain("approved");
    expect(approvalDatabase.boundValues).toContain("approver@example.test");
    expect(rejectionDatabase.boundValues).toContain("rejected");
    expect(rejectionDatabase.boundValues).toContain("reviewer@example.test");
  });

  it("blocks approval and sending until AI draft recipients are replaced", async () => {
    const pendingRecipient = "pending-recipient@redacted.invalid";
    const approvalDatabase = new RecordingD1Database({
      id: "draft_ai",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "draft",
      to_address: pendingRecipient,
      from_address: "security@honowarden.com",
      reply_to_address: "security+thread_1@honowarden.com",
      subject: "Re: Security",
      text_body: "suggested reply",
      in_reply_to_hash: null,
      references_hash: null,
    });
    const sendDatabase = new RecordingD1Database({
      id: "draft_ai",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "approved",
      to_address: pendingRecipient,
      from_address: "security@honowarden.com",
      reply_to_address: "security+thread_1@honowarden.com",
      subject: "Re: Security",
      text_body: "suggested reply",
      in_reply_to_hash: null,
      references_hash: null,
    });
    const sentMessages: unknown[] = [];

    const approval = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_ai/approve",
        {},
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: approvalDatabase as unknown as D1Database,
      } as InquiryBindings,
    );
    const send = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_ai/send",
        {},
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: sendDatabase as unknown as D1Database,
        EMAIL: {
          async send(message: unknown): Promise<unknown> {
            sentMessages.push(message);
            return { success: true };
          },
        } as InquiryBindings["EMAIL"],
      } as InquiryBindings,
    );

    expect(approval.status).toBe(409);
    expect(await approval.json()).toEqual({
      error: "draft_recipient_required",
    });
    expect(send.status).toBe(409);
    expect(await send.json()).toEqual({ error: "draft_recipient_required" });
    expect(sentMessages).toEqual([]);
    expect(approvalDatabase.queries.join("\n")).not.toContain(
      "UPDATE inquiry_drafts SET",
    );
    expect(sendDatabase.queries.join("\n")).not.toContain(
      "UPDATE inquiry_drafts SET",
    );
  });

  it("sends only approved drafts through the Email Service binding", async () => {
    const database = new RecordingD1Database({
      id: "draft_1",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "approved",
      to_address: "reporter@example.test",
      from_address: "support@honowarden.com",
      reply_to_address: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text_body: "approved reply body",
      in_reply_to_hash: "in-reply-to-hash",
      references_hash: "references-hash",
    });
    const sentMessages: unknown[] = [];

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        {},
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        EMAIL: {
          async send(message: unknown): Promise<unknown> {
            sentMessages.push(message);
            return { success: true };
          },
        } as InquiryBindings["EMAIL"],
      } as InquiryBindings,
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      to: "reporter@example.test",
      from: "support@honowarden.com",
      replyTo: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text: "approved reply body",
    });
    expect(payload).toMatchObject({
      draft: {
        id: "draft_1",
        status: "sent",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("approved reply body");
    expect(database.queries.join("\n")).toContain("UPDATE inquiry_drafts SET");
    expect(database.boundValues).toContain("sent");
    expect(database.boundValues.join("\n")).not.toContain(
      "reporter@example.test",
    );
  });

  it("records send failures without echoing provider errors or draft bodies", async () => {
    const database = new RecordingD1Database({
      id: "draft_1",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "approved",
      to_address: "reporter@example.test",
      from_address: "support@honowarden.com",
      reply_to_address: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text_body: "approved reply body",
      in_reply_to_hash: null,
      references_hash: null,
    });

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        {},
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        EMAIL: {
          async send(): Promise<unknown> {
            throw new Error("provider leaked reporter@example.test");
          },
        } as InquiryBindings["EMAIL"],
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({ error: "email_send_failed" });
    expect(JSON.stringify(payload)).not.toContain("approved reply body");
    expect(JSON.stringify(payload)).not.toContain("reporter@example.test");
    expect(database.boundValues).toContain("send_failed");
    expect(database.boundValues).toContain("email_send_failed");
  });
});

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = "POST",
): Request {
  return new Request(`https://inbox.example.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
