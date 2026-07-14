import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import type { InquiryBindings } from "../src/bindings";
import { RecordingD1Database, type RecordedD1Run } from "./support/fakes";

const humanOperatorHeaders = {
  "Cf-Access-Authenticated-User-Email": "operator@example.test",
};
const serviceOperatorHeaders = {
  "X-HonoWarden-Operator": "service:inquiry-automation",
};

type MutableDraftStatus = "draft" | "approved" | "sending" | "send_failed";

type MutationCase = {
  name: "edit" | "approve" | "reject" | "send" | "retry";
  path: string;
  method: "PATCH" | "POST";
  status: MutableDraftStatus;
  body: Record<string, unknown>;
};

const mutationCases = [
  {
    name: "edit",
    path: "/api/drafts/draft_1",
    method: "PATCH",
    status: "draft",
    body: { subject: "Re: Updated support", text: "updated reply body" },
  },
  {
    name: "approve",
    path: "/api/drafts/draft_1/approve",
    method: "POST",
    status: "draft",
    body: {},
  },
  {
    name: "reject",
    path: "/api/drafts/draft_1/reject",
    method: "POST",
    status: "draft",
    body: {},
  },
  {
    name: "send",
    path: "/api/drafts/draft_1/send",
    method: "POST",
    status: "approved",
    body: {},
  },
  {
    name: "retry",
    path: "/api/drafts/draft_1/retry",
    method: "POST",
    status: "send_failed",
    body: {},
  },
] satisfies readonly MutationCase[];

const operatorOnlyMutationCases = mutationCases.filter(
  (mutation) => mutation.name !== "edit",
);

describe("human-approved inquiry replies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
        version: 1,
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
      version: 1,
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
          version: 1,
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
        version: 2,
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
      version: 1,
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
      version: 1,
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
        { version: 1 },
        { "Cf-Access-Authenticated-User-Email": "approver@example.test" },
      ),
      {
        INQUIRY_DB: approvalDatabase as unknown as D1Database,
      } as InquiryBindings,
    );
    const rejected = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_2/reject",
        { version: 1 },
        { "Cf-Access-Authenticated-User-Email": "reviewer@example.test" },
      ),
      {
        INQUIRY_DB: rejectionDatabase as unknown as D1Database,
      } as InquiryBindings,
    );

    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({
      draft: { id: "draft_1", status: "approved", version: 2 },
    });
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({
      draft: { id: "draft_2", status: "rejected", version: 2 },
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
      version: 1,
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
      version: 1,
      to_address: pendingRecipient,
      from_address: "security@honowarden.com",
      reply_to_address: "security+thread_1@honowarden.com",
      subject: "Re: Security",
      text_body: "suggested reply",
      in_reply_to_hash: null,
      references_hash: null,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const approval = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_ai/approve",
        { version: 1 },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: approvalDatabase as unknown as D1Database,
      } as InquiryBindings,
    );
    const send = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_ai/send",
        { version: 1 },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: sendDatabase as unknown as D1Database,
        HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
      } as InquiryBindings,
    );

    expect(approval.status).toBe(409);
    expect(await approval.json()).toEqual({
      error: "draft_recipient_required",
    });
    expect(send.status).toBe(409);
    expect(await send.json()).toEqual({ error: "draft_recipient_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(approvalDatabase.queries.join("\n")).not.toContain(
      "UPDATE inquiry_drafts SET",
    );
    expect(sendDatabase.queries.join("\n")).not.toContain(
      "UPDATE inquiry_drafts SET",
    );
  });

  it("sends only approved drafts through Resend", async () => {
    const database = new RecordingD1Database({
      id: "draft_1",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "approved",
      version: 1,
      to_address: "reporter@example.test",
      from_address: "support@honowarden.com",
      reply_to_address: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text_body: "approved reply body",
      in_reply_to_hash: "in-reply-to-hash",
      references_hash: "references-hash",
    });
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => {
      const transitions = draftUpdateRuns(database);
      expect(transitions).toHaveLength(1);
      expectDraftTransition(
        transitions[0] as RecordedD1Run,
        "approved",
        "sending",
        1,
      );
      return new Response(JSON.stringify({ id: "provider-message-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
      } as InquiryBindings,
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test_synthetic",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      from: "support@honowarden.com",
      to: ["reporter@example.test"],
      reply_to: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text: "approved reply body",
      headers: {
        "X-HonoWarden-Inquiry-Thread": "thread_1",
        "X-HonoWarden-Inquiry-Draft": "draft_1",
      },
    });
    expect(payload).toMatchObject({
      draft: {
        id: "draft_1",
        status: "sent",
        version: 3,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("approved reply body");
    expect(JSON.stringify(payload)).not.toContain("re_test_synthetic");
    expect(database.queries.join("\n")).toContain("UPDATE inquiry_drafts SET");
    expect(database.boundValues).toContain("sent");
    expect(database.boundValues).toContain(
      "236e7e3eba1c76e7d8c0e05dbd613e3576339b1d540624274d3e129d73b790ea",
    );
    expect(database.boundValues).not.toContain("provider-message-id");
    const transitions = draftUpdateRuns(database);
    expect(transitions).toHaveLength(2);
    expectDraftTransition(
      transitions[1] as RecordedD1Run,
      "sending",
      "sent",
      2,
    );
    expect(database.boundValues.join("\n")).not.toContain(
      "reporter@example.test",
    );
    expect(database.boundValues.join("\n")).not.toContain(
      "approved reply body",
    );
    expect(database.boundValues.join("\n")).not.toContain("re_test_synthetic");
    expect(JSON.stringify(payload)).not.toContain("reporter@example.test");
  });

  it("records send failures without echoing provider errors or draft bodies", async () => {
    const database = new RecordingD1Database({
      id: "draft_1",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "approved",
      version: 1,
      to_address: "reporter@example.test",
      from_address: "support@honowarden.com",
      reply_to_address: "support+thread_1@honowarden.com",
      subject: "Re: Support",
      text_body: "approved reply body",
      in_reply_to_hash: null,
      references_hash: null,
    });

    const providerBodyText =
      "The honowarden.com domain is not verified. reporter@example.test";
    const providerResponse = new Response(
      JSON.stringify({ message: providerBodyText }),
      { status: 403 },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const transitions = draftUpdateRuns(database);
        expect(transitions).toHaveLength(1);
        expectDraftTransition(
          transitions[0] as RecordedD1Run,
          "approved",
          "sending",
          1,
        );
        return providerResponse;
      }),
    );

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({ error: "email_send_failed" });
    expect(JSON.stringify(payload)).not.toContain("approved reply body");
    expect(JSON.stringify(payload)).not.toContain("reporter@example.test");
    expect(JSON.stringify(payload)).not.toContain(providerBodyText);
    expect(JSON.stringify(payload)).not.toContain("re_test_synthetic");
    expect(database.boundValues).toContain("send_failed");
    expect(database.boundValues).toContain("E_SENDER_DOMAIN_NOT_AVAILABLE");
    const transitions = draftUpdateRuns(database);
    expect(transitions).toHaveLength(2);
    expectDraftTransition(
      transitions[1] as RecordedD1Run,
      "sending",
      "send_failed",
      2,
    );
    expect(database.boundValues.join("\n")).not.toContain(providerBodyText);
    expect(database.boundValues.join("\n")).not.toContain(
      "reporter@example.test",
    );
    expect(database.boundValues.join("\n")).not.toContain(
      "approved reply body",
    );
    expect(database.boundValues.join("\n")).not.toContain("re_test_synthetic");
    expect(providerResponse.bodyUsed).toBe(false);
  });

  it("fails closed without Resend configuration before acquiring the draft", async () => {
    const database = new RecordingD1Database(draftRecord("approved"));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        humanOperatorHeaders,
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "email_not_configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(draftUpdateRuns(database)).toHaveLength(0);
    expect(database.queries.join("\n")).not.toMatch(/UPDATE\s+inquiry_drafts/i);
  });

  it.each(mutationCases)(
    "requires a version for $name mutations",
    async (mutation) => {
      const database = new RecordingD1Database(draftRecord(mutation.status));
      let providerCalls = 0;

      const response = await worker.fetch(
        jsonRequest(
          mutation.path,
          mutationBody(mutation),
          humanOperatorHeaders,
          mutation.method,
        ),
        mutationBindings(database, () => {
          providerCalls += 1;
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid_version",
      });
      expect(database.completedRuns).toEqual([]);
      expect(providerCalls).toBe(0);
    },
  );

  it.each(mutationCases)(
    "rejects invalid versions for $name mutations",
    async (mutation) => {
      for (const invalidVersion of [0, -1, 1.5, "1"]) {
        const database = new RecordingD1Database(draftRecord(mutation.status));
        let providerCalls = 0;

        const response = await worker.fetch(
          jsonRequest(
            mutation.path,
            mutationBody(mutation, invalidVersion),
            humanOperatorHeaders,
            mutation.method,
          ),
          mutationBindings(database, () => {
            providerCalls += 1;
          }),
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: "invalid_version",
        });
        expect(database.completedRuns).toEqual([]);
        expect(providerCalls).toBe(0);
      }
    },
  );

  it.each(mutationCases)(
    "rejects a stale version for $name mutations",
    async (mutation) => {
      const database = new RecordingD1Database(
        draftRecord(mutation.status),
        [],
        [0],
      );
      let providerCalls = 0;

      const response = await worker.fetch(
        jsonRequest(
          mutation.path,
          mutationBody(mutation, 1),
          humanOperatorHeaders,
          mutation.method,
        ),
        mutationBindings(database, () => {
          providerCalls += 1;
        }),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "draft_version_conflict",
      });
      expect(database.completedRuns).toHaveLength(1);
      expectCasRun(database.completedRuns[0] as RecordedD1Run, mutation.status);
      expect(database.completedRuns[0]?.changes).toBe(0);
      expect(providerCalls).toBe(0);
    },
  );

  it("rejects a concurrent send before calling the provider", async () => {
    const database = new RecordingD1Database(draftRecord("approved"), [], [0]);
    let providerCalls = 0;

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        humanOperatorHeaders,
      ),
      mutationBindings(database, () => {
        providerCalls += 1;
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "draft_version_conflict",
    });
    expect(providerCalls).toBe(0);
    expect(draftUpdateRuns(database)).toHaveLength(1);
    expectDraftTransition(
      draftUpdateRuns(database)[0] as RecordedD1Run,
      "approved",
      "sending",
      1,
    );
    expect(database.completedRuns).toHaveLength(1);
  });

  it("allows only one provider call when two sends overlap", async () => {
    const database = new RecordingD1Database(
      draftRecord("approved"),
      [],
      [1, 0, 1, 1],
    );
    let releaseProvider: () => void = () => undefined;
    let markProviderEntered: () => void = () => undefined;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const providerEntered = new Promise<void>((resolve) => {
      markProviderEntered = resolve;
    });
    let providerCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        providerCalls += 1;
        markProviderEntered();
        await providerGate;
        return new Response(JSON.stringify({ id: "provider-message-id" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const env = {
      INQUIRY_DB: database as unknown as D1Database,
      HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
    } as InquiryBindings;

    const firstResponsePromise = worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        humanOperatorHeaders,
      ),
      env,
    );
    await providerEntered;

    const secondResponse = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        humanOperatorHeaders,
      ),
      env,
    );
    expect(secondResponse.status).toBe(409);
    await expect(secondResponse.json()).resolves.toEqual({
      error: "draft_version_conflict",
    });

    releaseProvider();
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.status).toBe(200);
    expect(providerCalls).toBe(1);
    expect(draftUpdateRuns(database)).toHaveLength(3);
  });

  it("leaves a send acquired when terminal persistence loses its CAS", async () => {
    const database = new RecordingD1Database(
      draftRecord("approved"),
      [],
      [1, 0],
    );
    let providerCalls = 0;

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        humanOperatorHeaders,
      ),
      mutationBindings(database, () => {
        providerCalls += 1;
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "draft_send_state_conflict",
    });
    expect(providerCalls).toBe(1);
    expect(draftUpdateRuns(database)).toHaveLength(2);
    expect(
      database.completedRuns.filter((run) =>
        /INSERT\s+INTO\s+inquiry_events/i.test(run.query),
      ),
    ).toEqual([]);
  });

  it("stores only a whitelisted provider error code after the sending CAS", async () => {
    const providerBodyText =
      "E_not-a-real-code reporter@example.test raw-provider-text";
    const database = new RecordingD1Database(draftRecord("approved"));
    const providerResponse = new Response(
      JSON.stringify({ message: providerBodyText }),
      { status: 400 },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerResponse),
    );

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        humanOperatorHeaders,
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({ error: "email_send_failed" });
    expect(database.boundValues).toContain("email_send_failed");
    expect(database.boundValues).not.toContain(providerBodyText);
    expect(database.boundValues.join("\n")).not.toContain("raw-provider-text");
    expect(database.boundValues.join("\n")).not.toContain("E_not-a-real-code");
    expect(database.boundValues.join("\n")).not.toContain(
      "reporter@example.test",
    );
    expect(database.boundValues.join("\n")).not.toContain("private reply body");
    expect(database.boundValues.join("\n")).not.toContain("re_test_synthetic");
    expect(JSON.stringify(payload)).not.toContain("reporter@example.test");
    expect(JSON.stringify(payload)).not.toContain("private reply body");
    expect(providerResponse.bodyUsed).toBe(false);
    const transitions = draftUpdateRuns(database);
    expect(transitions).toHaveLength(2);
    expectDraftTransition(
      transitions[0] as RecordedD1Run,
      "approved",
      "sending",
      1,
    );
    expectDraftTransition(
      transitions[1] as RecordedD1Run,
      "sending",
      "send_failed",
      2,
    );
  });

  it("allows an operator to retry a Resend rate-limit failure", async () => {
    const sendDatabase = new RecordingD1Database(draftRecord("approved"));
    const retryDatabase = new RecordingD1Database(
      draftRecord("send_failed", {
        version: 3,
        last_error_code: "E_PROVIDER_RATE_LIMITED",
      }),
    );
    let providerAttempts = 0;
    const fetchSpy = vi.fn(async () => {
      providerAttempts += 1;
      if (providerAttempts === 1) {
        return new Response(null, { status: 429 });
      }
      return new Response(JSON.stringify({ id: "retry-provider-message-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const sendResponse = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/send",
        { version: 1 },
        humanOperatorHeaders,
      ),
      {
        INQUIRY_DB: sendDatabase as unknown as D1Database,
        HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
      } as InquiryBindings,
    );

    expect(sendResponse.status).toBe(502);
    await expect(sendResponse.json()).resolves.toEqual({
      error: "email_send_failed",
    });
    expect(sendDatabase.boundValues).toContain("E_PROVIDER_RATE_LIMITED");
    expectDraftTransition(
      draftUpdateRuns(sendDatabase)[0] as RecordedD1Run,
      "approved",
      "sending",
      1,
    );
    expectDraftTransition(
      draftUpdateRuns(sendDatabase)[1] as RecordedD1Run,
      "sending",
      "send_failed",
      2,
    );

    const retryResponse = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/retry",
        { version: 3 },
        humanOperatorHeaders,
      ),
      {
        INQUIRY_DB: retryDatabase as unknown as D1Database,
        HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
      } as InquiryBindings,
    );

    expect(retryResponse.status).toBe(200);
    await expect(retryResponse.json()).resolves.toMatchObject({
      draft: { id: "draft_1", status: "sent", version: 5 },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expectDraftTransition(
      draftUpdateRuns(retryDatabase)[0] as RecordedD1Run,
      "send_failed",
      "sending",
      3,
    );
    expectDraftTransition(
      draftUpdateRuns(retryDatabase)[1] as RecordedD1Run,
      "sending",
      "sent",
      4,
    );
  });

  it("retries a structurally eligible failed send with a distinct audit event", async () => {
    const database = new RecordingD1Database(
      draftRecord("send_failed", {
        last_error_code: "E_PROVIDER_UNAVAILABLE",
      }),
    );
    const fetchSpy = vi.fn(async () => {
      const transitions = draftUpdateRuns(database);
      expect(transitions).toHaveLength(1);
      expectDraftTransition(
        transitions[0] as RecordedD1Run,
        "send_failed",
        "sending",
        1,
      );
      return new Response(JSON.stringify({ id: "retry-provider-message-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/retry",
        { version: 1 },
        humanOperatorHeaders,
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      draft: { id: "draft_1", status: "sent", version: 3 },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(payload)).not.toContain("reporter@example.test");
    expect(JSON.stringify(payload)).not.toContain("private reply body");
    const transitions = draftUpdateRuns(database);
    expect(transitions).toHaveLength(2);
    expectDraftTransition(
      transitions[1] as RecordedD1Run,
      "sending",
      "sent",
      2,
    );
    const auditRuns = database.completedRuns.filter((run) =>
      /INSERT\s+INTO\s+inquiry_events/i.test(run.query),
    );
    expect(auditRuns).toHaveLength(1);
    expect(auditRuns[0]?.boundValues).toContain("draft_send_retry");
  });

  it.each([
    ["a stuck sending draft", "sending", null],
    ["a non-retryable failure", "send_failed", "E_SENDER_DOMAIN_NOT_AVAILABLE"],
  ] as const)("refuses to retry %s", async (_name, status, errorCode) => {
    const database = new RecordingD1Database(
      draftRecord(status, { last_error_code: errorCode }),
    );
    let providerCalls = 0;

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/retry",
        { version: 1 },
        humanOperatorHeaders,
      ),
      mutationBindings(database, () => {
        providerCalls += 1;
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "draft_retry_not_eligible",
    });
    expect(providerCalls).toBe(0);
    expect(database.completedRuns).toEqual([]);
  });

  it("allows the service identity to create drafts", async () => {
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
          text: "service-created private reply body",
        },
        serviceOperatorHeaders,
      ),
      { INQUIRY_DB: database as unknown as D1Database } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      draft: { status: "draft", version: 1 },
    });
    expect(database.boundValues).toContain("service:inquiry-automation");
    expect(JSON.stringify(payload)).not.toContain(
      "service-created private reply body",
    );
    expect(JSON.stringify(payload)).not.toContain("reporter@example.test");
  });

  it.each(operatorOnlyMutationCases)(
    "denies the service identity for $name",
    async (mutation) => {
      const database = new RecordingD1Database(draftRecord(mutation.status));
      let providerCalls = 0;

      const response = await worker.fetch(
        jsonRequest(mutation.path, { version: 1 }, serviceOperatorHeaders),
        mutationBindings(database, () => {
          providerCalls += 1;
        }),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "operator_not_authorized",
      });
      expect(database.queries).toEqual([]);
      expect(database.completedRuns).toEqual([]);
      expect(providerCalls).toBe(0);
    },
  );

  it("allows a human member of the configured operator allowlist", async () => {
    const database = new RecordingD1Database(draftRecord("draft"));

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/approve",
        { version: 1 },
        humanOperatorHeaders,
      ),
      operatorBindings(database, "other@example.test, OPERATOR@EXAMPLE.TEST"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      draft: { id: "draft_1", status: "approved", version: 2 },
    });
  });

  it("denies a human who is not in the configured operator allowlist", async () => {
    const database = new RecordingD1Database(draftRecord("draft"));

    const response = await worker.fetch(
      jsonRequest(
        "/api/drafts/draft_1/approve",
        { version: 1 },
        humanOperatorHeaders,
      ),
      operatorBindings(database, "other@example.test"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "operator_not_authorized",
    });
    expect(database.queries).toEqual([]);
    expect(database.completedRuns).toEqual([]);
  });

  it.each([undefined, "", " , "])(
    "keeps human mutations enabled when the operator allowlist is %s",
    async (allowlist) => {
      const database = new RecordingD1Database(draftRecord("draft"));

      const response = await worker.fetch(
        jsonRequest(
          "/api/drafts/draft_1/approve",
          { version: 1 },
          humanOperatorHeaders,
        ),
        operatorBindings(database, allowlist),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        draft: { id: "draft_1", status: "approved", version: 2 },
      });
    },
  );
});

type DraftRecord = {
  id: string;
  thread_id: string;
  message_id: string;
  status: MutableDraftStatus;
  version: number;
  to_address: string;
  from_address: string;
  reply_to_address: string;
  subject: string;
  text_body: string;
  in_reply_to_hash: string | null;
  references_hash: string | null;
  last_error_code: string | null;
};

function draftRecord(
  status: MutableDraftStatus,
  overrides: Partial<DraftRecord> = {},
): DraftRecord {
  return {
    id: "draft_1",
    thread_id: "thread_1",
    message_id: "message_1",
    status,
    version: 1,
    to_address: "reporter@example.test",
    from_address: "support@honowarden.com",
    reply_to_address: "support+thread_1@honowarden.com",
    subject: "Re: Support",
    text_body: "private reply body",
    in_reply_to_hash: null,
    references_hash: null,
    last_error_code: status === "send_failed" ? "E_PROVIDER_UNAVAILABLE" : null,
    ...overrides,
  };
}

function mutationBody(
  mutation: MutationCase,
  version?: unknown,
): Record<string, unknown> {
  return version === undefined
    ? { ...mutation.body }
    : { ...mutation.body, version };
}

function mutationBindings(
  database: RecordingD1Database,
  onSend: () => void,
): InquiryBindings {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      onSend();
      return new Response(JSON.stringify({ id: "provider-message-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  return {
    INQUIRY_DB: database as unknown as D1Database,
    HONOWARDEN_RESEND_API_KEY: "re_test_synthetic",
  } as InquiryBindings;
}

function operatorBindings(
  database: RecordingD1Database,
  allowlist: string | undefined,
): InquiryBindings {
  const env = {
    INQUIRY_DB: database as unknown as D1Database,
  } as InquiryBindings & { HONOWARDEN_INQUIRY_OPERATORS?: string };

  if (allowlist !== undefined) {
    env.HONOWARDEN_INQUIRY_OPERATORS = allowlist;
  }

  return env;
}

function draftUpdateRuns(database: RecordingD1Database): RecordedD1Run[] {
  return database.completedRuns.filter((run) =>
    /UPDATE\s+inquiry_drafts\s+SET/i.test(run.query),
  );
}

function expectCasRun(
  run: RecordedD1Run,
  fromStatus: string,
  version = 1,
): void {
  expect(run.query).toMatch(/version\s*=\s*version\s*\+\s*1/i);
  const whereClause = run.query.split(/\bWHERE\b/i)[1] ?? "";
  expect(whereClause).toMatch(/\bid\b\s*=/i);
  expect(whereClause).toMatch(/\bstatus\b\s*=/i);
  expect(whereClause).toMatch(/\bversion\b\s*=/i);
  expect(run.boundValues).toEqual(expect.arrayContaining(["draft_1", version]));
  expect(`${run.query}\n${run.boundValues.join("\n")}`).toContain(fromStatus);
}

function expectDraftTransition(
  run: RecordedD1Run,
  fromStatus: string,
  toStatus: string,
  version: number,
): void {
  expectCasRun(run, fromStatus, version);
  expect(run.boundValues).toContain(toStatus);
  expect(run.boundValues).toContain(version);
}

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
