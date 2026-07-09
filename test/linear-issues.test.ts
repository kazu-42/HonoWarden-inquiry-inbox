import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import type { InquiryBindings } from "../src/bindings";
import { RecordingD1Database } from "./support/fakes";

describe("inquiry Linear issue workflow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an Access identity before preparing or creating Linear issues", async () => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      jsonRequest("/api/linear-issues", {
        threadId: "thread_1",
        messageId: "message_1",
        mailbox: "security",
        title: "Security report",
        redactedSummary: "Reporter observed a login anomaly.",
      }),
      {
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );

    expect(response.status).toBe(401);
    expect(database.queries).toEqual([]);
  });

  it("prepares a draft Linear issue link without calling Linear", async () => {
    const database = new RecordingD1Database();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await worker.fetch(
      jsonRequest(
        "/api/linear-issues",
        {
          threadId: "thread_1",
          messageId: "message_1",
          mailbox: "security",
          title: "Security report",
          redactedSummary: "Reporter observed a login anomaly.",
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
      linearIssue: {
        status: "draft",
        threadId: "thread_1",
        duplicate: false,
        requiresHumanApproval: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("login anomaly");
    expect(database.queries.join("\n")).toContain(
      "INSERT INTO inquiry_linear_links",
    );
    expect(database.queries.join("\n")).toContain("INSERT INTO inquiry_events");
    expect(database.boundValues).toContain("thread_1");
    expect(database.boundValues).toContain("message_1");
    expect(database.boundValues).toContain("Security report");
    expect(database.boundValues).toContain(
      "Reporter observed a login anomaly.",
    );
    expect(database.boundValues).toContain("operator@example.test");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an existing linked Linear issue instead of creating duplicates", async () => {
    const database = new RecordingD1Database({
      id: "link_1",
      thread_id: "thread_1",
      message_id: "message_1",
      status: "created",
      linear_issue_id: "issue-id",
      linear_issue_identifier: "HON-123",
      linear_issue_url: "https://linear.app/honowarden/issue/HON-123/redacted",
      title: "Security report",
      redacted_summary: "redacted summary",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await worker.fetch(
      jsonRequest(
        "/api/linear-issues",
        {
          threadId: "thread_1",
          messageId: "message_1",
          mailbox: "security",
          title: "Security report",
          redactedSummary: "Reporter observed a login anomaly.",
          confirmCreate: true,
        },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        LINEAR_API_KEY: "linear_should_not_print",
        HONOWARDEN_LINEAR_TEAM_ID: "team-id",
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      linearIssue: {
        status: "created",
        threadId: "thread_1",
        identifier: "HON-123",
        url: "https://linear.app/honowarden/issue/HON-123/redacted",
        duplicate: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("redacted summary");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(database.queries.join("\n")).toContain("SELECT");
    expect(database.queries.join("\n")).not.toContain(
      "INSERT INTO inquiry_linear_links",
    );
  });

  it("creates a Linear issue only after explicit operator approval", async () => {
    const database = new RecordingD1Database();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        expect(init.headers).toMatchObject({
          authorization: "linear_should_not_print",
        });
        expect(String(init.body)).toContain(
          "Reporter observed a login anomaly",
        );
        expect(String(init.body)).not.toContain("raw private body");

        return Response.json({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue-id",
                identifier: "HON-123",
                url: "https://linear.app/honowarden/issue/HON-123/redacted",
              },
            },
          },
        });
      }),
    );

    const response = await worker.fetch(
      jsonRequest(
        "/api/linear-issues",
        {
          threadId: "thread_1",
          messageId: "message_1",
          mailbox: "security",
          title: "Security report",
          redactedSummary: "Reporter observed a login anomaly.",
          confirmCreate: true,
        },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        LINEAR_API_KEY: "linear_should_not_print",
        HONOWARDEN_LINEAR_TEAM_ID: "team-id",
        HONOWARDEN_LINEAR_DEFAULT_LABEL_IDS: "label-a,label-b",
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      linearIssue: {
        status: "created",
        threadId: "thread_1",
        identifier: "HON-123",
        url: "https://linear.app/honowarden/issue/HON-123/redacted",
        duplicate: false,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("login anomaly");
    expect(JSON.stringify(payload)).not.toContain("linear_should_not_print");
    expect(database.queries.join("\n")).toContain(
      "INSERT INTO inquiry_linear_links",
    );
    expect(database.queries.join("\n")).toContain(
      "UPDATE inquiry_linear_links SET",
    );
    expect(database.boundValues).toContain("created");
    expect(database.boundValues).toContain("HON-123");
    expect(database.boundValues).toContain(
      "https://linear.app/honowarden/issue/HON-123/redacted",
    );
    expect(database.boundValues.join("\n")).not.toContain(
      "linear_should_not_print",
    );
  });

  it("records Linear provider failures without exposing token or summary", async () => {
    const database = new RecordingD1Database();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("provider leaked linear_should_not_print");
      }),
    );

    const response = await worker.fetch(
      jsonRequest(
        "/api/linear-issues",
        {
          threadId: "thread_1",
          messageId: "message_1",
          mailbox: "security",
          title: "Security report",
          redactedSummary: "Reporter observed a login anomaly.",
          confirmCreate: true,
        },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
        LINEAR_API_KEY: "linear_should_not_print",
        HONOWARDEN_LINEAR_TEAM_ID: "team-id",
      } as InquiryBindings,
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: "linear_create_failed" });
    expect(JSON.stringify(payload)).not.toContain("linear_should_not_print");
    expect(JSON.stringify(payload)).not.toContain("login anomaly");
    expect(database.queries.join("\n")).toContain(
      "UPDATE inquiry_linear_links SET",
    );
    expect(database.boundValues).toContain("failed");
    expect(database.boundValues).toContain("linear_create_failed");
    expect(database.boundValues.join("\n")).not.toContain(
      "linear_should_not_print",
    );
  });

  it("fails closed when Linear credentials are not configured for create", async () => {
    const database = new RecordingD1Database();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await worker.fetch(
      jsonRequest(
        "/api/linear-issues",
        {
          threadId: "thread_1",
          messageId: "message_1",
          mailbox: "security",
          title: "Security report",
          redactedSummary: "Reporter observed a login anomaly.",
          confirmCreate: true,
        },
        { "Cf-Access-Authenticated-User-Email": "operator@example.test" },
      ),
      {
        INQUIRY_DB: database as unknown as D1Database,
      } as InquiryBindings,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "linear_not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(database.queries.join("\n")).toContain("INSERT INTO inquiry_events");
    expect(database.boundValues).toContain("linear_create_blocked");
  });
});

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://inbox.example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
