import type { InquiryBindings } from "./bindings";
import {
  getInquiryDraftQueueItem,
  inquiryDraftStatuses,
  listInquiryDraftQueue,
  type InquiryDraftQueueCursor,
  type InquiryDraftQueueRecord,
  type InquiryDraftStatus,
} from "./repository";

const defaultPageLimit = 25;
const maximumPageLimit = 100;
const subjectPreviewLength = 64;
const retryableEmailErrorCodes = new Set(["E_PROVIDER_UNAVAILABLE"]);

type QueueCursorPayload = InquiryDraftQueueCursor & {
  statuses: InquiryDraftStatus[];
};

export async function listOperatorDrafts(
  request: Request,
  env: InquiryBindings,
  now: Date,
): Promise<Response> {
  const url = new URL(request.url);
  const statuses = parseStatuses(url.searchParams);
  if (!statuses) {
    return jsonResponse({ error: "invalid_status" }, 400);
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  if (!limit) {
    return jsonResponse({ error: "invalid_limit" }, 400);
  }

  const cursor = parseCursor(url.searchParams.get("cursor"), statuses);
  if (cursor === undefined) {
    return jsonResponse({ error: "invalid_cursor" }, 400);
  }

  const rows = await listInquiryDraftQueue(env.INQUIRY_DB, {
    statuses,
    limit: limit + 1,
    cursor,
  });
  const page = rows.slice(0, limit);
  const lastDraft = page.at(-1);
  const nextCursor =
    rows.length > limit && lastDraft
      ? encodeCursor({
          updatedAt: lastDraft.updatedAt,
          id: lastDraft.id,
          statuses,
        })
      : null;

  return jsonResponse({
    drafts: page.map((draft) => projectDraft(draft, now)),
    nextCursor,
  });
}

export async function getOperatorDraft(
  env: InquiryBindings,
  draftId: string,
  now: Date,
): Promise<Response> {
  const draft = await getInquiryDraftQueueItem(env.INQUIRY_DB, draftId);
  if (!draft) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }

  return jsonResponse({ draft: projectDraft(draft, now) });
}

export function isRetryableEmailErrorCode(errorCode: string | null): boolean {
  return errorCode !== null && retryableEmailErrorCodes.has(errorCode);
}

function projectDraft(draft: InquiryDraftQueueRecord, now: Date) {
  const lastErrorCode = projectLastErrorCode(draft.lastErrorCode);
  const linearIssue =
    draft.linearIssueId && draft.linearIssueIdentifier && draft.linearIssueUrl
      ? {
          id: draft.linearIssueId,
          identifier: draft.linearIssueIdentifier,
          url: draft.linearIssueUrl,
        }
      : null;

  return {
    id: draft.id,
    threadId: draft.threadId,
    messageId: draft.messageId,
    status: draft.status,
    version: draft.version,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    ageSeconds: ageSeconds(draft.createdAt, now),
    toAddressHash: draft.toAddressHash,
    subjectPreview: draft.subject.slice(0, subjectPreviewLength),
    createdBy: draft.createdBy,
    approvedBy: draft.approvedBy,
    rejectedBy: draft.rejectedBy,
    sentBy: draft.sentBy,
    sentAt: draft.sentAt,
    providerMessageIdHash: draft.providerMessageIdHash,
    lastErrorCode,
    retryEligible:
      draft.status === "send_failed" &&
      isRetryableEmailErrorCode(lastErrorCode),
    stuck: draft.status === "sending",
    linearIssue,
  };
}

function projectLastErrorCode(errorCode: string | null): string | null {
  if (errorCode === null) {
    return null;
  }

  return errorCode === "email_send_failed" ||
    /^E_[A-Z0-9_]{1,64}$/.test(errorCode)
    ? errorCode
    : "email_send_failed";
}

function parseStatuses(
  searchParams: URLSearchParams,
): InquiryDraftStatus[] | null {
  const requested = searchParams
    .getAll("status")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (requested.length === 0) {
    return [...inquiryDraftStatuses];
  }

  const requestedSet = new Set(requested);
  if (
    [...requestedSet].some(
      (status) => !inquiryDraftStatuses.includes(status as InquiryDraftStatus),
    )
  ) {
    return null;
  }

  return inquiryDraftStatuses.filter((status) => requestedSet.has(status));
}

function parseLimit(value: string | null): number | null {
  if (value === null) {
    return defaultPageLimit;
  }
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, maximumPageLimit);
}

function parseCursor(
  value: string | null,
  statuses: InquiryDraftStatus[],
): InquiryDraftQueueCursor | null | undefined {
  if (value === null) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(value)) as unknown;
    if (!isCursorPayload(payload)) {
      return undefined;
    }
    if (
      payload.statuses.length !== statuses.length ||
      payload.statuses.some((status, index) => status !== statuses[index])
    ) {
      return undefined;
    }

    return { updatedAt: payload.updatedAt, id: payload.id };
  } catch {
    return undefined;
  }
}

function isCursorPayload(value: unknown): value is QueueCursorPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.updatedAt === "string" &&
    value.updatedAt.length > 0 &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Array.isArray(value.statuses) &&
    value.statuses.every(
      (status) =>
        typeof status === "string" &&
        inquiryDraftStatuses.includes(status as InquiryDraftStatus),
    )
  );
}

function encodeCursor(payload: QueueCursorPayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("invalid cursor encoding");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(`${base64}${padding}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function ageSeconds(createdAt: string, now: Date): number {
  const createdAtMilliseconds = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMilliseconds)) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((now.getTime() - createdAtMilliseconds) / 1000),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
