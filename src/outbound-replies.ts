import type { InquiryBindings } from "./bindings";
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

  if (url.pathname === "/api/drafts" && request.method === "POST") {
    return createDraft(request, env, now);
  }

  const draftMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftMatch && request.method === "PATCH") {
    const draftId = draftMatch[1];
    if (!draftId) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return editDraft(request, env, decodeURIComponent(draftId), now);
  }

  const decisionMatch = url.pathname.match(
    /^\/api\/drafts\/([^/]+)\/(approve|reject)$/,
  );
  if (decisionMatch && request.method === "POST") {
    const draftId = decisionMatch[1];
    const decision = decisionMatch[2];
    if (!draftId || (decision !== "approve" && decision !== "reject")) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return decideDraft(
      request,
      env,
      decodeURIComponent(draftId),
      decision,
      now,
    );
  }

  const sendMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/send$/);
  if (sendMatch && request.method === "POST") {
    const draftId = sendMatch[1];
    if (!draftId) {
      return jsonResponse({ error: "draft_not_found" }, 404);
    }

    return sendDraft(request, env, decodeURIComponent(draftId), now);
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

  const draft = await getInquiryDraft(env.INQUIRY_DB, draftId);
  if (!draft) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }
  if (draft.status !== "draft") {
    return jsonResponse({ error: "draft_not_editable" }, 409);
  }

  const body = await readJsonObject(request);
  const subject = requiredString(body.subject);
  const text = requiredString(body.text);
  if (!subject) {
    return jsonResponse({ error: "invalid_subject" }, 400);
  }
  if (!text) {
    return jsonResponse({ error: "invalid_text" }, 400);
  }

  const updatedAt = now.toISOString();
  await updateInquiryDraftContent(env.INQUIRY_DB, {
    id: draft.id,
    subject,
    textBody: text,
    updatedAt,
  });
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
  const operator = resolveOperatorIdentity(request);
  if (!operator) {
    return jsonResponse({ error: "operator_identity_required" }, 401);
  }

  const draft = await getInquiryDraft(env.INQUIRY_DB, draftId);
  if (!draft) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }
  if (draft.status !== "draft") {
    return jsonResponse({ error: "draft_not_reviewable" }, 409);
  }

  const status = decision === "approve" ? "approved" : "rejected";
  const decidedAt = now.toISOString();
  await updateInquiryDraftStatus(env.INQUIRY_DB, {
    id: draft.id,
    status,
    operator,
    at: decidedAt,
  });
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
    },
  });
}

async function sendDraft(
  request: Request,
  env: InquiryBindings,
  draftId: string,
  now: Date,
): Promise<Response> {
  const operator = resolveOperatorIdentity(request);
  if (!operator) {
    return jsonResponse({ error: "operator_identity_required" }, 401);
  }
  if (!env.EMAIL) {
    return jsonResponse({ error: "email_binding_missing" }, 503);
  }

  const draft = await getInquiryDraft(env.INQUIRY_DB, draftId);
  if (!draft) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }
  if (draft.status !== "approved") {
    return jsonResponse({ error: "draft_not_approved" }, 409);
  }

  const sentAt = now.toISOString();
  let result: EmailSendResult;

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
  } catch {
    await updateInquiryDraftStatus(env.INQUIRY_DB, {
      id: draft.id,
      status: "send_failed",
      operator,
      at: sentAt,
      lastErrorCode: "email_send_failed",
    });
    await recordInquiryEvent(env.INQUIRY_DB, {
      id: crypto.randomUUID(),
      threadId: draft.threadId,
      messageId: draft.messageId,
      eventType: "draft_send",
      status: "send_failed",
      metadataJson: JSON.stringify({
        draftId: draft.id,
        errorCode: "email_send_failed",
      }),
      occurredAt: sentAt,
    });

    return jsonResponse({ error: "email_send_failed" }, 502);
  }

  await updateInquiryDraftStatus(env.INQUIRY_DB, {
    id: draft.id,
    status: "sent",
    operator,
    at: sentAt,
    providerMessageIdHash: result.messageId
      ? await sha256Hex(result.messageId)
      : null,
  });
  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: draft.threadId,
    messageId: draft.messageId,
    eventType: "draft_send",
    status: "sent",
    metadataJson: JSON.stringify({ draftId: draft.id }),
    occurredAt: sentAt,
  });

  return jsonResponse({
    draft: {
      id: draft.id,
      status: "sent",
    },
  });
}

function resolveOperatorIdentity(request: Request): string | null {
  const identity =
    request.headers.get("Cf-Access-Authenticated-User-Email") ??
    request.headers.get("X-HonoWarden-Operator");

  if (!identity) {
    return null;
  }

  const normalized = identity.trim().toLowerCase();
  return normalized.includes("@") ? normalized : null;
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

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredString(value);
}

function requiredEmail(value: unknown): string | null {
  const text = requiredString(value)?.toLowerCase();
  return text && text.includes("@") ? text : null;
}

function requiredHonowardenEmail(value: unknown): string | null {
  const text = requiredEmail(value);
  return text?.endsWith("@honowarden.com") ? text : null;
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
