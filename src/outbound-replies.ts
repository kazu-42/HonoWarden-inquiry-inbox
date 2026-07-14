import { createAiTriageRun, pendingTriageRecipient } from "./ai-triage";
import {
  authenticateInquiryAccess,
  verifiedOperatorHeader,
  withVerifiedOperator,
} from "./access-auth";
import type { InquiryBindings } from "./bindings";
import { resolveEmailErrorCode } from "./email-errors";
import { createLinearIssueWorkflow } from "./linear-issues";
import {
  getOperatorDraft,
  isRetryableEmailErrorCode,
  listOperatorDrafts,
} from "./operator-queue";
import { operatorQueuePageResponse } from "./operator-ui";
import {
  getInquiryDraft,
  recordInquiryDraft,
  recordInquiryEvent,
  updateInquiryDraftContent,
  updateInquiryDraftStatus,
} from "./repository";

const textEncoder = new TextEncoder();

export async function handleInquiryHttpRequest(
  request: Request,
  env: InquiryBindings,
  now = new Date(),
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/") || url.pathname === "/operator") {
    const auth = await authenticateInquiryAccess(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    request = withVerifiedOperator(request, auth.operator);
  }

  if (url.pathname === "/operator") {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: {
          Allow: "GET",
          "Content-Type": "application/json",
        },
      });
    }

    return operatorQueuePageResponse();
  }

  if (url.pathname === "/api/drafts" && request.method === "POST") {
    return createDraft(request, env, now);
  }

  if (url.pathname === "/api/drafts" && request.method === "GET") {
    return listOperatorDrafts(request, env, now);
  }

  if (url.pathname === "/api/triage-runs" && request.method === "POST") {
    return createAiTriageRun(request, env, now);
  }

  if (url.pathname === "/api/linear-issues" && request.method === "POST") {
    const operator = resolveOperatorIdentity(request);
    if (!operator) {
      return jsonResponse({ error: "operator_identity_required" }, 401);
    }

    return createLinearIssueWorkflow(request, env, operator, now);
  }

  const draftMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftMatch && request.method === "GET") {
    const draftId = decodePathSegment(draftMatch[1]);
    if (!draftId) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return getOperatorDraft(env, draftId, now);
  }

  if (draftMatch && request.method === "PATCH") {
    const draftId = decodePathSegment(draftMatch[1]);
    if (!draftId) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return editDraft(request, env, draftId, now);
  }

  const decisionMatch = url.pathname.match(
    /^\/api\/drafts\/([^/]+)\/(approve|reject)$/,
  );
  if (decisionMatch && request.method === "POST") {
    const draftId = decodePathSegment(decisionMatch[1]);
    const decision = decisionMatch[2];
    if (!draftId || (decision !== "approve" && decision !== "reject")) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return decideDraft(request, env, draftId, decision, now);
  }

  const sendMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/send$/);
  if (sendMatch && request.method === "POST") {
    const draftId = decodePathSegment(sendMatch[1]);
    if (!draftId) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return sendDraft(request, env, draftId, "send", now);
  }

  const retryMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/retry$/);
  if (retryMatch && request.method === "POST") {
    const draftId = decodePathSegment(retryMatch[1]);
    if (!draftId) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return sendDraft(request, env, draftId, "retry", now);
  }

  if (url.pathname.startsWith("/api/")) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  return null;
}

async function createDraft(
  request: Request,
  env: InquiryBindings,
  now: Date,
): Promise<Response> {
  const operator = resolveOperatorIdentity(request);
  if (!operator) {
    return jsonResponse({ error: "operator_identity_required" }, 401);
  }

  const body = await readJsonObject(request);
  const draft = validateDraftInput(body);
  if (!draft.ok) {
    return jsonResponse({ error: draft.error }, 400);
  }

  const createdAt = now.toISOString();
  const id = `draft_${crypto.randomUUID()}`;
  const replyToAddress = buildReplyToAddress(
    draft.value.from,
    draft.value.threadId,
  );

  await recordInquiryDraft(env.INQUIRY_DB, {
    id,
    threadId: draft.value.threadId,
    messageId: draft.value.messageId,
    status: "draft",
    toAddress: draft.value.to,
    toAddressHash: await sha256Hex(draft.value.to),
    fromAddress: draft.value.from,
    replyToAddress,
    subject: draft.value.subject,
    textBody: draft.value.text,
    inReplyToHash: draft.value.inReplyTo
      ? await sha256Hex(draft.value.inReplyTo)
      : null,
    referencesHash: draft.value.references
      ? await sha256Hex(draft.value.references)
      : null,
    createdBy: operator,
    createdAt,
    updatedAt: createdAt,
  });

  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: draft.value.threadId,
    messageId: draft.value.messageId,
    eventType: "draft_create",
    status: "draft",
    metadataJson: JSON.stringify({ draftId: id }),
    occurredAt: createdAt,
  });

  return jsonResponse(
    {
      draft: {
        id,
        threadId: draft.value.threadId,
        messageId: draft.value.messageId,
        status: "draft",
        version: 1,
      },
    },
    201,
  );
}

async function editDraft(
  request: Request,
  env: InquiryBindings,
  draftId: string,
  now: Date,
): Promise<Response> {
  const operator = resolveOperatorIdentity(request);
  if (!operator) {
    return jsonResponse({ error: "operator_identity_required" }, 401);
  }

  const body = await readJsonObject(request);
  const version = requiredVersion(body.version);
  if (!version) {
    return jsonResponse({ error: "invalid_version" }, 400);
  }

  const draft = await getInquiryDraft(env.INQUIRY_DB, draftId);
  if (!draft) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }
  if (draft.version !== version) {
    return jsonResponse({ error: "draft_version_conflict" }, 409);
  }
  if (draft.status !== "draft") {
    return jsonResponse({ error: "draft_not_editable" }, 409);
  }

  const subject = requiredString(body.subject);
  const text = requiredString(body.text);
  const to = optionalEmail(body.to);
  const from = optionalHonowardenEmail(body.from);
  if (!subject) {
    return jsonResponse({ error: "invalid_subject" }, 400);
  }
  if (!text) {
    return jsonResponse({ error: "invalid_text" }, 400);
  }
  if (body.to !== undefined && !to) {
    return jsonResponse({ error: "invalid_to" }, 400);
  }
  if (body.from !== undefined && !from) {
    return jsonResponse({ error: "invalid_from" }, 400);
  }

  const updatedAt = now.toISOString();
  const toAddress = to ?? draft.toAddress;
  const fromAddress = from ?? draft.fromAddress;
  const updated = await updateInquiryDraftContent(env.INQUIRY_DB, {
    id: draft.id,
    expectedVersion: version,
    toAddress,
    toAddressHash: await sha256Hex(toAddress),
    fromAddress,
    replyToAddress: buildReplyToAddress(fromAddress, draft.threadId),
    subject,
    textBody: text,
    updatedAt,
  });
  if (!updated) {
    return jsonResponse({ error: "draft_version_conflict" }, 409);
  }
  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: draft.threadId,
    messageId: draft.messageId,
    eventType: "draft_edit",
    status: "draft",
    metadataJson: JSON.stringify({ draftId: draft.id, operator }),
    occurredAt: updatedAt,
  });

  return jsonResponse({
    draft: {
      id: draft.id,
      status: "draft",
      version: version + 1,
    },
  });
}

async function decideDraft(
  request: Request,
  env: InquiryBindings,
  draftId: string,
  decision: "approve" | "reject",
  now: Date,
): Promise<Response> {
  const authorization = authorizeHumanOperator(request, env);
  if (!authorization.ok) {
    return jsonResponse({ error: authorization.error }, authorization.status);
  }

  const body = await readJsonObject(request);
  const version = requiredVersion(body.version);
  if (!version) {
    return jsonResponse({ error: "invalid_version" }, 400);
  }

  const draft = await getInquiryDraft(env.INQUIRY_DB, draftId);
  if (!draft) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }
  if (draft.version !== version) {
    return jsonResponse({ error: "draft_version_conflict" }, 409);
  }
  if (draft.status !== "draft") {
    return jsonResponse({ error: "draft_not_reviewable" }, 409);
  }
  if (decision === "approve" && draft.toAddress === pendingTriageRecipient) {
    return jsonResponse({ error: "draft_recipient_required" }, 409);
  }

  const status = decision === "approve" ? "approved" : "rejected";
  const decidedAt = now.toISOString();
  const updated = await updateInquiryDraftStatus(env.INQUIRY_DB, {
    id: draft.id,
    expectedStatus: "draft",
    expectedVersion: version,
    status,
    operator: authorization.operator,
    at: decidedAt,
  });
  if (!updated) {
    return jsonResponse({ error: "draft_version_conflict" }, 409);
  }
  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: draft.threadId,
    messageId: draft.messageId,
    eventType: decision === "approve" ? "draft_approve" : "draft_reject",
    status,
    metadataJson: JSON.stringify({ draftId: draft.id }),
    occurredAt: decidedAt,
  });

  return jsonResponse({
    draft: {
      id: draft.id,
      status,
      version: version + 1,
    },
  });
}

async function sendDraft(
  request: Request,
  env: InquiryBindings,
  draftId: string,
  mode: "send" | "retry",
  now: Date,
): Promise<Response> {
  const authorization = authorizeHumanOperator(request, env);
  if (!authorization.ok) {
    return jsonResponse({ error: authorization.error }, authorization.status);
  }

  const body = await readJsonObject(request);
  const version = requiredVersion(body.version);
  if (!version) {
    return jsonResponse({ error: "invalid_version" }, 400);
  }

  const draft = await getInquiryDraft(env.INQUIRY_DB, draftId);
  if (!draft) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }
  if (draft.version !== version) {
    return jsonResponse({ error: "draft_version_conflict" }, 409);
  }
  if (mode === "send" && draft.status !== "approved") {
    return jsonResponse({ error: "draft_not_approved" }, 409);
  }
  if (
    mode === "retry" &&
    (draft.status !== "send_failed" ||
      !isRetryableEmailErrorCode(draft.lastErrorCode))
  ) {
    return jsonResponse({ error: "draft_retry_not_eligible" }, 409);
  }
  if (draft.toAddress === pendingTriageRecipient) {
    return jsonResponse({ error: "draft_recipient_required" }, 409);
  }
  if (!env.EMAIL) {
    return jsonResponse({ error: "email_binding_missing" }, 503);
  }

  const sentAt = now.toISOString();
  const sourceStatus = mode === "send" ? "approved" : "send_failed";
  const acquired = await updateInquiryDraftStatus(env.INQUIRY_DB, {
    id: draft.id,
    expectedStatus: sourceStatus,
    expectedVersion: version,
    status: "sending",
    operator: authorization.operator,
    at: sentAt,
  });
  if (!acquired) {
    return jsonResponse({ error: "draft_version_conflict" }, 409);
  }

  const acquiredVersion = version + 1;
  const eventType = mode === "send" ? "draft_send" : "draft_send_retry";
  let result: EmailSendResult | null = null;
  let providerErrorCode: string | null = null;

  try {
    result = await env.EMAIL.send({
      to: draft.toAddress,
      from: draft.fromAddress,
      replyTo: draft.replyToAddress,
      subject: draft.subject,
      text: draft.textBody,
      headers: {
        "X-HonoWarden-Inquiry-Thread": draft.threadId,
        "X-HonoWarden-Inquiry-Draft": draft.id,
      },
    });
  } catch (error) {
    providerErrorCode = resolveEmailErrorCode(error, "email_send_failed");
    console.error(
      JSON.stringify({
        event: "inquiry.email_send_failed",
        providerErrorCode,
      }),
    );
  }

  if (providerErrorCode) {
    const completed = await updateInquiryDraftStatus(env.INQUIRY_DB, {
      id: draft.id,
      expectedStatus: "sending",
      expectedVersion: acquiredVersion,
      status: "send_failed",
      operator: authorization.operator,
      at: sentAt,
      lastErrorCode: providerErrorCode,
    });
    if (!completed) {
      return sendStateConflictResponse(draft.id, "send_failed");
    }
    await recordInquiryEvent(env.INQUIRY_DB, {
      id: crypto.randomUUID(),
      threadId: draft.threadId,
      messageId: draft.messageId,
      eventType,
      status: "send_failed",
      metadataJson: JSON.stringify({
        draftId: draft.id,
        errorCode: providerErrorCode,
      }),
      occurredAt: sentAt,
    });

    return jsonResponse({ error: "email_send_failed" }, 502);
  }

  const providerMessageIdHash = result?.messageId
    ? await sha256Hex(result.messageId)
    : null;
  const completed = await updateInquiryDraftStatus(env.INQUIRY_DB, {
    id: draft.id,
    expectedStatus: "sending",
    expectedVersion: acquiredVersion,
    status: "sent",
    operator: authorization.operator,
    at: sentAt,
    providerMessageIdHash,
  });
  if (!completed) {
    return sendStateConflictResponse(draft.id, "sent");
  }
  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: draft.threadId,
    messageId: draft.messageId,
    eventType,
    status: "sent",
    metadataJson: JSON.stringify({ draftId: draft.id }),
    occurredAt: sentAt,
  });

  return jsonResponse({
    draft: {
      id: draft.id,
      status: "sent",
      version: acquiredVersion + 1,
    },
  });
}

function sendStateConflictResponse(
  draftId: string,
  targetStatus: "sent" | "send_failed",
): Response {
  console.error(
    JSON.stringify({
      event: "inquiry.email_send_state_conflict",
      draftId,
      targetStatus,
    }),
  );
  return jsonResponse({ error: "draft_send_state_conflict" }, 503);
}

function resolveOperatorIdentity(request: Request): string | null {
  const identity = request.headers.get(verifiedOperatorHeader);

  if (!identity) {
    return null;
  }

  const normalized = identity.trim().toLowerCase();
  return normalized.includes("@") || normalized === "service:inquiry-automation"
    ? normalized
    : null;
}

function decodePathSegment(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function authorizeHumanOperator(
  request: Request,
  env: InquiryBindings,
):
  | { ok: true; operator: string }
  | {
      ok: false;
      error: "operator_identity_required" | "operator_not_authorized";
      status: 401 | 403;
    } {
  const operator = resolveOperatorIdentity(request);
  if (!operator) {
    return {
      ok: false,
      error: "operator_identity_required",
      status: 401,
    };
  }
  if (operator === "service:inquiry-automation") {
    return { ok: false, error: "operator_not_authorized", status: 403 };
  }

  const configuredOperators = (env.HONOWARDEN_INQUIRY_OPERATORS ?? "")
    .split(",")
    .map((identity) => identity.trim().toLowerCase())
    .filter((identity) => identity.length > 0);
  if (
    configuredOperators.length > 0 &&
    !configuredOperators.includes(operator)
  ) {
    return { ok: false, error: "operator_not_authorized", status: 403 };
  }

  return { ok: true, operator };
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function validateDraftInput(
  value: Record<string, unknown>,
): { ok: true; value: DraftInput } | { ok: false; error: string } {
  const threadId = requiredString(value.threadId);
  const messageId = optionalString(value.messageId);
  const to = requiredEmail(value.to);
  const from = requiredHonowardenEmail(value.from);
  const subject = requiredString(value.subject);
  const text = requiredString(value.text);
  const inReplyTo = optionalString(value.inReplyTo);
  const references = optionalString(value.references);

  if (!threadId || !threadId.startsWith("thread_")) {
    return { ok: false, error: "invalid_thread_id" };
  }
  if (!to) {
    return { ok: false, error: "invalid_to" };
  }
  if (!from) {
    return { ok: false, error: "invalid_from" };
  }
  if (!subject) {
    return { ok: false, error: "invalid_subject" };
  }
  if (!text) {
    return { ok: false, error: "invalid_text" };
  }

  return {
    ok: true,
    value: {
      threadId,
      messageId,
      to,
      from,
      subject,
      text,
      inReplyTo,
      references,
    },
  };
}

function buildReplyToAddress(from: string, threadId: string): string {
  const [localPart, domain] = from.split("@");
  return `${localPart}+${threadId}@${domain}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function requiredVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredString(value);
}

function requiredEmail(value: unknown): string | null {
  const text = requiredString(value)?.toLowerCase();
  return text && text.includes("@") ? text : null;
}

function optionalEmail(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredEmail(value);
}

function requiredHonowardenEmail(value: unknown): string | null {
  const text = requiredEmail(value);
  return text?.endsWith("@honowarden.com") ? text : null;
}

function optionalHonowardenEmail(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : requiredHonowardenEmail(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

type DraftInput = {
  threadId: string;
  messageId: string | null;
  to: string;
  from: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string | null;
};
