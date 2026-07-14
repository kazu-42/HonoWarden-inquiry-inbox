import { describe, expect, it } from "vitest";

import type { InquiryBindings } from "../src/bindings";
import worker from "../src/index";
import { RecordingD1Database } from "./support/fakes";

const queueStatuses = [
  "draft",
  "approved",
  "rejected",
  "sending",
  "sent",
  "send_failed",
] as const;

type QueueStatus = (typeof queueStatuses)[number];

type QueueRow = {
  id: string;
  thread_id: string;
  message_id: string | null;
  status: QueueStatus;
  version: number;
  to_address: string;
  to_address_hash: string;
  from_address: string;
  reply_to_address: string;
  subject: string;
  text_body: string;
  created_by: string;
  approved_by: string | null;
  rejected_by: string | null;
  sent_by: string | null;
  sent_at: string | null;
  provider_message_id_hash: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
  linear_issue_id: string | null;
  linear_issue_identifier: string | null;
  linear_issue_url: string | null;
  provider_error_text: string;
};

type QueueDraftProjection = {
  id: string;
  threadId: string;
  messageId: string | null;
  status: QueueStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  ageSeconds: number;
  toAddressHash: string;
  subjectPreview: string;
  createdBy: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  sentBy: string | null;
  sentAt: string | null;
  providerMessageIdHash: string | null;
  lastErrorCode: string | null;
  retryEligible: boolean;
  stuck: boolean;
  linearIssue: {
    id: string;
    identifier: string;
    url: string;
  } | null;
};

const projectionKeys = [
  "id",
  "threadId",
  "messageId",
  "status",
  "version",
  "createdAt",
  "updatedAt",
  "ageSeconds",
  "toAddressHash",
  "subjectPreview",
  "createdBy",
  "approvedBy",
  "rejectedBy",
  "sentBy",
  "sentAt",
  "providerMessageIdHash",
  "lastErrorCode",
  "retryEligible",
  "stuck",
  "linearIssue",
] as const;

describe("inquiry operator queue read API", () => {
  it("filters a list by one status and orders it newest first", async () => {
    const row = queueRow("draft", 0);
    const database = new RecordingD1Database(null, [row]);

    const response = await worker.fetch(
      operatorRequest("/api/drafts?status=draft&limit=10"),
      bindings(database),
    );
    const payload = (await response.json()) as {
      drafts: QueueDraftProjection[];
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload.drafts.map((draft) => draft.id)).toEqual([row.id]);
    expect(database.boundValues).toContain("draft");

    const query = database.queries.join("\n");
    expect(query).toMatch(/WHERE[\s\S]*status/i);
    const orderBy = query.match(/ORDER BY([\s\S]*?)LIMIT/i)?.[1] ?? "";
    expect(orderBy).toMatch(/\bupdated_at\b\s+DESC/i);
    expect(orderBy).toMatch(/\bid\b\s+DESC/i);
  });

  it("accepts repeated status filters and preserves newest-first results", async () => {
    const newest = queueRow("send_failed", 0);
    const older = queueRow("draft", 1);
    const database = new RecordingD1Database(null, [newest, older]);

    const response = await worker.fetch(
      operatorRequest("/api/drafts?status=draft&status=send_failed&limit=10"),
      bindings(database),
    );
    const payload = (await response.json()) as {
      drafts: QueueDraftProjection[];
    };

    expect(response.status).toBe(200);
    expect(payload.drafts.map((draft) => draft.id)).toEqual([
      newest.id,
      older.id,
    ]);
    expect(database.boundValues).toEqual(
      expect.arrayContaining(["draft", "send_failed"]),
    );
    expect(database.queries.join("\n")).toMatch(
      /status\s+IN\s*\(\s*\?\s*,\s*\?\s*\)/i,
    );
  });

  it("caps an oversized limit and retains one row to derive a cursor", async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      queueRow("draft", index),
    );
    const database = new RecordingD1Database(null, rows);

    const response = await worker.fetch(
      operatorRequest("/api/drafts?status=draft&limit=10000"),
      bindings(database),
    );
    const payload = (await response.json()) as {
      drafts: QueueDraftProjection[];
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload.drafts.length).toBeLessThanOrEqual(100);
    expect(payload.nextCursor).toEqual(expect.any(String));
    expect(database.boundValues).not.toContain(10_000);
    expect(
      database.boundValues.some(
        (value) => typeof value === "number" && value > 0 && value <= 101,
      ),
    ).toBe(true);
  });

  it("returns an opaque cursor that can fetch the next page", async () => {
    const newest = queueRow("draft", 0, {
      id: "draft_newest",
      updated_at: "2026-07-13T01:02:03.000Z",
    });
    const older = queueRow("draft", 1, {
      id: "draft_older",
      updated_at: "2026-07-12T01:02:03.000Z",
    });
    const firstPageDatabase = new RecordingD1Database(null, [newest, older]);

    const firstResponse = await worker.fetch(
      operatorRequest("/api/drafts?status=draft&limit=1"),
      bindings(firstPageDatabase),
    );
    const firstPayload = (await firstResponse.json()) as {
      drafts: QueueDraftProjection[];
      nextCursor: string | null;
    };

    expect(firstResponse.status).toBe(200);
    expect(firstPayload.drafts.map((draft) => draft.id)).toEqual([newest.id]);
    expect(firstPayload.nextCursor).toEqual(expect.any(String));

    const cursor = firstPayload.nextCursor as string;
    expect(cursor).not.toContain(newest.id);
    expect(cursor).not.toContain(newest.updated_at);

    const secondPageDatabase = new RecordingD1Database(null, [older]);
    const secondResponse = await worker.fetch(
      operatorRequest(
        `/api/drafts?status=draft&limit=1&cursor=${encodeURIComponent(cursor)}`,
      ),
      bindings(secondPageDatabase),
    );
    const secondPayload = (await secondResponse.json()) as {
      drafts: QueueDraftProjection[];
      nextCursor: string | null;
    };

    expect(secondResponse.status).toBe(200);
    expect(secondPayload.drafts.map((draft) => draft.id)).toEqual([older.id]);
    expect(secondPageDatabase.boundValues).toContain(newest.updated_at);
    expect(secondPageDatabase.boundValues).toContain(newest.id);
  });

  it("returns an empty page without manufacturing a cursor", async () => {
    const database = new RecordingD1Database(null, []);

    const response = await worker.fetch(
      operatorRequest("/api/drafts?status=draft&limit=10"),
      bindings(database),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      drafts: [],
      nextCursor: null,
    });
  });

  it.each([
    ["/api/drafts?status=unknown", "invalid_status"],
    ["/api/drafts?limit=0", "invalid_limit"],
    ["/api/drafts?limit=-1", "invalid_limit"],
    ["/api/drafts?limit=1.5", "invalid_limit"],
    ["/api/drafts?limit=lots", "invalid_limit"],
    ["/api/drafts?cursor=not-a-valid-cursor", "invalid_cursor"],
  ])("rejects an invalid queue query at %s", async (path, error) => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      operatorRequest(path),
      bindings(database),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(database.queries).toEqual([]);
  });

  it("rejects a cursor reused with different status filters", async () => {
    const newest = queueRow("draft", 0);
    const older = queueRow("draft", 1);
    const firstResponse = await worker.fetch(
      operatorRequest("/api/drafts?status=draft&limit=1"),
      bindings(new RecordingD1Database(null, [newest, older])),
    );
    const firstPayload = (await firstResponse.json()) as {
      nextCursor: string;
    };
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      operatorRequest(
        `/api/drafts?status=approved&cursor=${encodeURIComponent(firstPayload.nextCursor)}`,
      ),
      bindings(database),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_cursor" });
    expect(database.queries).toEqual([]);
  });

  it("returns structural not-found responses for missing and malformed IDs", async () => {
    for (const [path, database] of [
      ["/api/drafts/draft_missing", new RecordingD1Database()],
      ["/api/drafts/%", new RecordingD1Database()],
    ] as const) {
      const response = await worker.fetch(
        operatorRequest(path),
        bindings(database),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "draft_not_found",
      });
    }
  });

  it("returns only the redacted projection for every queue state", async () => {
    const rows = queueStatuses.map((status, index) => queueRow(status, index));
    const database = new RecordingD1Database(null, rows);
    const statuses = queueStatuses
      .map((status) => `status=${encodeURIComponent(status)}`)
      .join("&");

    const response = await worker.fetch(
      operatorRequest(`/api/drafts?${statuses}&limit=10`),
      bindings(database),
    );
    const payload = (await response.json()) as {
      drafts: QueueDraftProjection[];
    };

    expect(response.status).toBe(200);
    expect(payload.drafts).toHaveLength(rows.length);
    payload.drafts.forEach((draft, index) => {
      const row = rows[index];
      expect(row).toBeDefined();
      expectSafeProjection(draft, row as QueueRow);
    });
    expectNoSensitiveValues(payload, rows);
  });

  it.each(queueStatuses)(
    "gets a %s draft using only the redacted projection",
    async (status) => {
      const row = queueRow(status, queueStatuses.indexOf(status));
      const database = new RecordingD1Database(row);

      const response = await worker.fetch(
        operatorRequest(`/api/drafts/${row.id}`),
        bindings(database),
      );
      const payload = (await response.json()) as {
        draft: QueueDraftProjection;
      };

      expect(response.status).toBe(200);
      expectSafeProjection(payload.draft, row);
      expectNoSensitiveValues(payload, [row]);
    },
  );

  it("includes the linked Linear issue reference without linked private text", async () => {
    const row = queueRow("approved", 0, {
      linear_issue_id: "linear-issue-id",
      linear_issue_identifier: "HON-119",
      linear_issue_url:
        "https://linear.app/honowarden/issue/HON-119/operator-queue-api",
    });
    const database = new RecordingD1Database({
      ...row,
      redacted_summary: "linked-private-summary-marker",
    });

    const response = await worker.fetch(
      operatorRequest(`/api/drafts/${row.id}`),
      bindings(database),
    );
    const payload = (await response.json()) as {
      draft: QueueDraftProjection;
    };

    expect(response.status).toBe(200);
    expect(payload.draft.linearIssue).toEqual({
      id: "linear-issue-id",
      identifier: "HON-119",
      url: "https://linear.app/honowarden/issue/HON-119/operator-queue-api",
    });
    expect(JSON.stringify(payload)).not.toContain(
      "linked-private-summary-marker",
    );
    expect(database.queries.join("\n")).toMatch(
      /LEFT\s+JOIN\s+inquiry_linear_links/i,
    );
  });

  it("marks structurally retryable failures without making non-retryable failures eligible", async () => {
    const retryable = queueRow("send_failed", 0, {
      last_error_code: "E_PROVIDER_UNAVAILABLE",
    });
    const rateLimited = queueRow("send_failed", 1, {
      last_error_code: "E_PROVIDER_RATE_LIMITED",
    });
    const nonRetryable = queueRow("send_failed", 2, {
      last_error_code: "E_SENDER_DOMAIN_NOT_AVAILABLE",
    });

    for (const [row, expected] of [
      [retryable, true],
      [rateLimited, true],
      [nonRetryable, false],
    ] as const) {
      const response = await worker.fetch(
        operatorRequest(`/api/drafts/${row.id}`),
        bindings(new RecordingD1Database(row)),
      );
      const payload = (await response.json()) as {
        draft: QueueDraftProjection;
      };

      expect(response.status).toBe(200);
      expect(payload.draft.retryEligible).toBe(expected);
      expect(payload.draft.stuck).toBe(false);
    }
  });

  it("fails closed when a stored error code contains raw provider text", async () => {
    const rawError = "provider leaked recipient@example.test raw details";
    const row = queueRow("send_failed", 0, { last_error_code: rawError });

    const response = await worker.fetch(
      operatorRequest(`/api/drafts/${row.id}`),
      bindings(new RecordingD1Database(row)),
    );
    const payload = (await response.json()) as {
      draft: QueueDraftProjection;
    };

    expect(response.status).toBe(200);
    expect(payload.draft.lastErrorCode).toBe("email_send_failed");
    expect(payload.draft.retryEligible).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(rawError);
    expect(JSON.stringify(payload)).not.toContain("recipient@example.test");
  });
});

function queueRow(
  status: QueueStatus,
  index: number,
  overrides: Partial<QueueRow> = {},
): QueueRow {
  const id = `draft_${status}_${index}`;
  const createdAt = new Date(Date.UTC(2025, 6, 13, 0, 0, -index));
  const updatedAt = new Date(Date.UTC(2026, 6, 13, 0, 0, -index));

  return {
    id,
    thread_id: `thread_${index}`,
    message_id: `message_${index}`,
    status,
    version: index + 1,
    to_address: `recipient-${id}@example.test`,
    to_address_hash: `recipient-hash-${id}`,
    from_address: `support-${id}@honowarden.com`,
    reply_to_address: `support+${id}@honowarden.com`,
    subject: `Queue subject ${id} ${"subject-preview-marker-".repeat(4)}`,
    text_body: `private-body-${id}`,
    created_by: `creator-${index}@honowarden.com`,
    approved_by:
      status === "approved" ||
      status === "sending" ||
      status === "sent" ||
      status === "send_failed"
        ? `approver-${index}@honowarden.com`
        : null,
    rejected_by:
      status === "rejected" ? `reviewer-${index}@honowarden.com` : null,
    sent_by:
      status === "sent" || status === "send_failed"
        ? `sender-${index}@honowarden.com`
        : null,
    sent_at:
      status === "sent" || status === "send_failed"
        ? updatedAt.toISOString()
        : null,
    provider_message_id_hash:
      status === "sent" ? `provider-message-hash-${id}` : null,
    last_error_code: status === "send_failed" ? "E_PROVIDER_UNAVAILABLE" : null,
    created_at: createdAt.toISOString(),
    updated_at: updatedAt.toISOString(),
    linear_issue_id: null,
    linear_issue_identifier: null,
    linear_issue_url: null,
    provider_error_text: `raw-provider-error-${id}`,
    ...overrides,
  };
}

function operatorRequest(path: string): Request {
  return new Request(`https://inbox.example.test${path}`, {
    headers: {
      "Cf-Access-Authenticated-User-Email": "operator@example.test",
    },
  });
}

function bindings(database: RecordingD1Database): InquiryBindings {
  return {
    INQUIRY_DB: database as unknown as D1Database,
  };
}

function expectSafeProjection(
  projection: QueueDraftProjection,
  row: QueueRow,
): void {
  expect(Object.keys(projection).sort()).toEqual([...projectionKeys].sort());
  expect(projection).toMatchObject({
    id: row.id,
    threadId: row.thread_id,
    messageId: row.message_id,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ageSeconds: expect.any(Number),
    toAddressHash: row.to_address_hash,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    rejectedBy: row.rejected_by,
    sentBy: row.sent_by,
    sentAt: row.sent_at,
    providerMessageIdHash: row.provider_message_id_hash,
    lastErrorCode: row.last_error_code,
    retryEligible:
      row.status === "send_failed" &&
      row.last_error_code === "E_PROVIDER_UNAVAILABLE",
    stuck: row.status === "sending",
    linearIssue: null,
  });
  expect(projection.ageSeconds).toBeGreaterThanOrEqual(0);
  expect(projection.subjectPreview.length).toBeLessThanOrEqual(64);
  expect(projection.subjectPreview).not.toBe(row.subject);
  expect(row.subject.startsWith(projection.subjectPreview)).toBe(true);
}

function expectNoSensitiveValues(payload: unknown, rows: QueueRow[]): void {
  const serialized = JSON.stringify(payload);
  for (const row of rows) {
    expect(serialized).not.toContain(row.to_address);
    expect(serialized).not.toContain(row.from_address);
    expect(serialized).not.toContain(row.reply_to_address);
    expect(serialized).not.toContain(row.text_body);
    expect(serialized).not.toContain(row.provider_error_text);
  }
}
