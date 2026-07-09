import type { InquiryBindings } from "./bindings";
import {
  recordInquiryAiRun,
  recordInquiryDraft,
  recordInquiryEvent,
} from "./repository";

const promptVersion = "honowarden-inquiry-triage-v1";
const modelId = "local-policy-v1";
const textEncoder = new TextEncoder();
export const pendingTriageRecipient = "pending-recipient@redacted.invalid";

export type InquiryClassification =
  | "security_report"
  | "support_request"
  | "abuse_postmaster"
  | "general_inquiry"
  | "noise_spam";

export type TriageClassificationResult = {
  classification: InquiryClassification;
  confidence: number;
  recommendedAction:
    | "escalate_security"
    | "queue_support_review"
    | "queue_ops_review"
    | "queue_general_review"
    | "mark_noise";
  requiresHumanApproval: boolean;
};

export async function createAiTriageRun(
  request: Request,
  env: InquiryBindings,
  now = new Date(),
): Promise<Response> {
  const operator = resolveOperatorIdentity(request);
  if (!operator) {
    return jsonResponse({ error: "operator_identity_required" }, 401);
  }

  const body = await readJsonObject(request);
  const input = validateTriageInput(body);
  if (!input.ok) {
    return jsonResponse({ error: input.error }, 400);
  }

  const redacted = redactTriageText(input.value.text);
  const classification = classifyRedactedInquiry({
    mailbox: input.value.mailbox,
    subject: input.value.subject,
    redactedText: redacted.text,
    escalationThreshold: parseThreshold(
      env.HONOWARDEN_INQUIRY_AI_ESCALATION_THRESHOLD,
      0.75,
    ),
  });
  const createdAt = now.toISOString();
  const draftId = `draft_${crypto.randomUUID()}`;
  const runId = `ai_run_${crypto.randomUUID()}`;
  const draftText = buildDraftSuggestion(classification);
  const toolCalls = [
    {
      name: "redact_context",
      output: redacted.redactions,
    },
    {
      name: "classify_inquiry",
      output: classification,
    },
    {
      name: "propose_draft",
      output: {
        draftId,
        requiresHumanApproval: true,
      },
    },
  ];

  await recordInquiryDraft(env.INQUIRY_DB, {
    id: draftId,
    threadId: input.value.threadId,
    messageId: input.value.messageId,
    status: "draft",
    toAddress: pendingTriageRecipient,
    toAddressHash: await sha256Hex(pendingTriageRecipient),
    fromAddress: input.value.from,
    replyToAddress: buildReplyToAddress(input.value.from, input.value.threadId),
    subject: `Re: ${input.value.subject}`,
    textBody: draftText,
    inReplyToHash: null,
    referencesHash: null,
    createdBy: `ai:${modelId}`,
    createdAt,
    updatedAt: createdAt,
  });
  await recordInquiryAiRun(env.INQUIRY_DB, {
    id: runId,
    threadId: input.value.threadId,
    messageId: input.value.messageId,
    draftId,
    promptVersion,
    modelId,
    redactedContextJson: JSON.stringify({
      mailbox: input.value.mailbox,
      subject: input.value.subject,
      text: redacted.text,
      redactions: redacted.redactions,
    }),
    classification: classification.classification,
    confidence: classification.confidence,
    recommendedAction: classification.recommendedAction,
    requiresHumanApproval: classification.requiresHumanApproval,
    toolCallsJson: JSON.stringify(toolCalls),
    createdBy: operator,
    createdAt,
  });
  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: input.value.threadId,
    messageId: input.value.messageId,
    eventType: "ai_triage",
    status: classification.classification,
    metadataJson: JSON.stringify({
      runId,
      draftId,
      classification: classification.classification,
      confidence: classification.confidence,
    }),
    occurredAt: createdAt,
  });

  return jsonResponse(
    {
      triage: {
        id: runId,
        promptVersion,
        modelId,
        redactedContext: {
          text: redacted.text,
          redactions: redacted.redactions,
        },
        ...classification,
        toolCalls,
      },
      draft: {
        id: draftId,
        status: "draft",
      },
    },
    201,
  );
}

export function redactTriageText(value: string): {
  text: string;
  redactions: { emails: number; tokens: number };
} {
  let emails = 0;
  let tokens = 0;
  const withoutEmails = value.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    () => {
      emails += 1;
      return "[redacted_email]";
    },
  );
  const text = withoutEmails.replace(
    /\b(?:bearer|token|api[_-]?key|secret)\s+[a-z0-9._~+/=-]{6,}/gi,
    () => {
      tokens += 1;
      return "[redacted_token]";
    },
  );

  return {
    text: text.slice(0, 2000),
    redactions: { emails, tokens },
  };
}

export function classifyRedactedInquiry(input: {
  mailbox: string;
  subject: string;
  redactedText: string;
  escalationThreshold: number;
}): TriageClassificationResult {
  const text =
    `${input.mailbox} ${input.subject} ${input.redactedText}`.toLowerCase();

  if (
    input.mailbox === "security" ||
    /vulnerability|xss|csrf|sql injection|secret leak|bearer|token/.test(text)
  ) {
    return {
      classification: "security_report",
      confidence: 0.92,
      recommendedAction: "escalate_security",
      requiresHumanApproval: true,
    };
  }

  if (input.mailbox === "abuse" || input.mailbox === "postmaster") {
    return {
      classification: "abuse_postmaster",
      confidence: 0.88,
      recommendedAction: "queue_ops_review",
      requiresHumanApproval: true,
    };
  }

  if (/spam|casino|crypto giveaway|buy now/.test(text)) {
    return {
      classification: "noise_spam",
      confidence: 0.82,
      recommendedAction: "mark_noise",
      requiresHumanApproval: true,
    };
  }

  if (input.mailbox === "support" || /help|login|bug|support/.test(text)) {
    return {
      classification: "support_request",
      confidence: 0.81,
      recommendedAction: "queue_support_review",
      requiresHumanApproval: true,
    };
  }

  return {
    classification: "general_inquiry",
    confidence: Math.max(0.61, input.escalationThreshold - 0.2),
    recommendedAction: "queue_general_review",
    requiresHumanApproval: true,
  };
}

function buildDraftSuggestion(result: TriageClassificationResult): string {
  if (result.classification === "security_report") {
    return [
      "Thanks for contacting HonoWarden security.",
      "A human maintainer will review this report before any external reply is sent.",
      "Please do not send secrets or exploit details to public channels.",
    ].join("\n\n");
  }

  return [
    "Thanks for contacting HonoWarden.",
    "A human maintainer will review this inquiry before any external reply is sent.",
  ].join("\n\n");
}

function validateTriageInput(
  value: Record<string, unknown>,
): { ok: true; value: TriageInput } | { ok: false; error: string } {
  const threadId = requiredString(value.threadId);
  const messageId = optionalString(value.messageId);
  const mailbox = requiredString(value.mailbox);
  const from = requiredHonowardenEmail(value.from);
  const subject = requiredString(value.subject);
  const text = requiredString(value.text);

  if (!threadId?.startsWith("thread_")) {
    return { ok: false, error: "invalid_thread_id" };
  }
  if (!mailbox) {
    return { ok: false, error: "invalid_mailbox" };
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
      mailbox,
      from,
      subject,
      text,
    },
  };
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

function parseThreshold(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : fallback;
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

type TriageInput = {
  threadId: string;
  messageId: string | null;
  mailbox: string;
  from: string;
  subject: string;
  text: string;
};
