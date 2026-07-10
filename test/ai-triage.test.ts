import { describe, expect, it } from "vitest";

import worker from "../src/index";
import { classifyRedactedInquiry, redactTriageText } from "../src/ai-triage";
import type { InquiryBindings } from "../src/bindings";
import { RecordingD1Database } from "./support/fakes";

describe("AI inquiry triage", () => {
  it("redacts private addresses and token-like values before classification", () => {
    const redacted = redactTriageText(
      "Reporter reporter@example.test shared Bearer secret-token-123 about XSS.",
    );

    expect(redacted.text).toContain("[redacted_email]");
    expect(redacted.text).toContain("[redacted_token]");
    expect(redacted.text).not.toContain("reporter@example.test");
    expect(redacted.text).not.toContain("secret-token-123");
    expect(redacted.redactions).toMatchObject({
      emails: 1,
      tokens: 1,
    });
  });

  it("classifies security reports with mandatory human approval", () => {
    const result = classifyRedactedInquiry({
      mailbox: "security",
      subject: "Possible XSS",
      redactedText: "Possible XSS vulnerability in login form",
      escalationThreshold: 0.75,
    });

    expect(result).toMatchObject({
      classification: "security_report",
      requiresHumanApproval: true,
      recommendedAction: "escalate_security",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("creates redacted triage audit output and a draft suggestion", async () => {
    const database = new RecordingD1Database();
    const rawText =
      "Reporter reporter@example.test disclosed Bearer secret-token-123 and an XSS bug.";

    const response = await worker.fetch(
      new Request("https://inbox.example.test/api/triage-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Cf-Access-Authenticated-User-Email": "operator@example.test",
        },
        body: JSON.stringify({
          threadId: "thread_1",
          messageId: "message_1",
          mailbox: "security",
          from: "security@honowarden.com",
          to: "reporter@example.test",
          subject: "Possible XSS",
          text: rawText,
        }),
      }),
      {
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );
    const payload = await response.json();
    const serializedPayload = JSON.stringify(payload);
    const boundValues = database.boundValues.join("\n");

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      triage: {
        classification: "security_report",
        requiresHumanApproval: true,
        recommendedAction: "escalate_security",
      },
      draft: {
        status: "draft",
      },
    });
    expect(serializedPayload).toContain("[redacted_email]");
    expect(serializedPayload).not.toContain("reporter@example.test");
    expect(serializedPayload).not.toContain("secret-token-123");
    expect(boundValues).not.toContain("reporter@example.test");
    expect(boundValues).not.toContain("secret-token-123");
    expect(database.queries.join("\n")).toContain(
      "INSERT INTO inquiry_ai_runs",
    );
    expect(database.queries.join("\n")).toContain("INSERT INTO inquiry_drafts");
  });

  it("sends only redacted context to Workers AI and persists validated output", async () => {
    const database = new RecordingD1Database();
    const calls: Array<{ model: string; input: unknown }> = [];
    const ai = {
      async run(model: string, input: unknown) {
        calls.push({ model, input });
        return {
          response: JSON.stringify({
            classification: "support_request",
            confidence: 0.91,
            draftText: "Thanks for the report. A maintainer will review it.",
          }),
        };
      },
    };

    const response = await worker.fetch(
      new Request("https://inbox.example.test/api/triage-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Cf-Access-Authenticated-User-Email": "operator@example.test",
        },
        body: JSON.stringify({
          threadId: "thread_workers_ai",
          messageId: "message_workers_ai",
          mailbox: "support",
          from: "support@honowarden.com",
          subject: "Help for reporter@example.test with token secret-token-123",
          text: "Please contact reporter@example.test using Bearer secret-token-123.",
        }),
      }),
      {
        AI: ai as unknown as Ai,
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_AI_PROVIDER: "workers-ai",
        HONOWARDEN_INQUIRY_AI_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      } as InquiryBindings,
    );
    const payload = await response.json();
    const serializedCall = JSON.stringify(calls);
    const boundValues = database.boundValues.join("\n");

    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(serializedCall).toContain("[redacted_email]");
    expect(serializedCall).toContain("[redacted_token]");
    expect(serializedCall).not.toContain("reporter@example.test");
    expect(serializedCall).not.toContain("secret-token-123");
    expect(payload).toMatchObject({
      triage: {
        modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        classification: "security_report",
        confidence: 0.92,
        recommendedAction: "escalate_security",
        requiresHumanApproval: true,
      },
    });
    expect(boundValues).toContain(
      "Thanks for the report. A maintainer will review it.",
    );
    expect(boundValues).not.toContain("reporter@example.test");
    expect(boundValues).not.toContain("secret-token-123");
  });

  it("fails loudly without persistence when Workers AI returns an invalid result", async () => {
    const database = new RecordingD1Database();
    const ai = {
      async run() {
        return { response: "not-json" };
      },
    };

    const response = await worker.fetch(
      new Request("https://inbox.example.test/api/triage-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Cf-Access-Authenticated-User-Email": "operator@example.test",
        },
        body: JSON.stringify({
          threadId: "thread_invalid_ai",
          mailbox: "support",
          from: "support@honowarden.com",
          subject: "Help",
          text: "Login is failing.",
        }),
      }),
      {
        AI: ai as unknown as Ai,
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_AI_PROVIDER: "workers-ai",
      } as InquiryBindings,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "ai_provider_invalid_response",
    });
    expect(database.queries).toEqual([]);
  });

  it("fails loudly when Workers AI is configured without a binding", async () => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      new Request("https://inbox.example.test/api/triage-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Cf-Access-Authenticated-User-Email": "operator@example.test",
        },
        body: JSON.stringify({
          threadId: "thread_missing_ai",
          mailbox: "support",
          from: "support@honowarden.com",
          subject: "Help",
          text: "Login is failing.",
        }),
      }),
      {
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_AI_PROVIDER: "workers-ai",
      } as InquiryBindings,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "ai_provider_unavailable",
    });
    expect(database.queries).toEqual([]);
  });

  it("keeps security escalation mandatory when the model suggests a weaker action", async () => {
    const database = new RecordingD1Database();
    const ai = {
      async run() {
        return {
          response: JSON.stringify({
            classification: "general_inquiry",
            confidence: 0.55,
            draftText: "Thanks. A maintainer will review this security report.",
          }),
        };
      },
    };

    const response = await worker.fetch(
      new Request("https://inbox.example.test/api/triage-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Cf-Access-Authenticated-User-Email": "operator@example.test",
        },
        body: JSON.stringify({
          threadId: "thread_security_guard",
          mailbox: "security",
          from: "security@honowarden.com",
          subject: "Possible vulnerability",
          text: "A vulnerability may expose encrypted data.",
        }),
      }),
      {
        AI: ai as unknown as Ai,
        INQUIRY_DB: database as unknown as D1Database,
        HONOWARDEN_INQUIRY_AI_PROVIDER: "workers-ai",
      } as InquiryBindings,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      triage: {
        classification: "security_report",
        confidence: 0.92,
        recommendedAction: "escalate_security",
        requiresHumanApproval: true,
      },
    });
  });
});
