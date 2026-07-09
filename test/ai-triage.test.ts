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
});
