import type { InquiryBindings } from "./bindings";
import { defaultInquiryMailboxes } from "./bindings";
import {
  getInquiryLinearLinkByThread,
  recordInquiryEvent,
  recordInquiryLinearLink,
  updateInquiryLinearLinkCreated,
  updateInquiryLinearLinkFailed,
} from "./repository";
import type { InquiryLinearLinkRecord } from "./repository";

type LinearIssueRequest = {
  threadId: string;
  messageId: string | null;
  mailbox: string;
  title: string;
  redactedSummary: string;
  confirmCreate: boolean;
};

type LinearCreateResult =
  | {
      ok: true;
      issue: {
        id: string;
        identifier: string;
        url: string;
      };
    }
  | {
      ok: false;
      error: "linear_not_configured" | "linear_create_failed";
    };

const defaultLinearApiUrl = "https://api.linear.app/graphql";
const defaultPriority = 3;

export async function createLinearIssueWorkflow(
  request: Request,
  env: InquiryBindings,
  operator: string,
  now = new Date(),
): Promise<Response> {
  const body = await readJsonObject(request);
  const input = validateLinearIssueInput(body);
  if (!input.ok) {
    return jsonResponse({ error: input.error }, 400);
  }

  const requestedAt = now.toISOString();
  const existing = await getInquiryLinearLinkByThread(
    env.INQUIRY_DB,
    input.value.threadId,
  );
  if (existing?.status === "created") {
    await recordInquiryEvent(env.INQUIRY_DB, {
      id: crypto.randomUUID(),
      threadId: existing.threadId,
      messageId: existing.messageId,
      eventType: "linear_duplicate",
      status: "created",
      metadataJson: JSON.stringify({
        linearIssueIdentifier: existing.linearIssueIdentifier,
      }),
      occurredAt: requestedAt,
    });

    return jsonResponse({
      linearIssue: publicLinearIssue(existing, true),
    });
  }

  const link =
    existing ??
    (await createDraftLink(env, input.value, operator, requestedAt));

  if (!input.value.confirmCreate) {
    return jsonResponse(
      {
        linearIssue: {
          id: link.id,
          status: link.status,
          threadId: link.threadId,
          duplicate: Boolean(existing),
          requiresHumanApproval: true,
        },
      },
      existing ? 200 : 201,
    );
  }

  const linearResult = await createLinearIssue(env, input.value, operator);
  if (!linearResult.ok) {
    await updateInquiryLinearLinkFailed(env.INQUIRY_DB, {
      id: link.id,
      approvedBy: operator,
      lastErrorCode: linearResult.error,
      updatedAt: requestedAt,
    });
    await recordInquiryEvent(env.INQUIRY_DB, {
      id: crypto.randomUUID(),
      threadId: input.value.threadId,
      messageId: input.value.messageId,
      eventType:
        linearResult.error === "linear_not_configured"
          ? "linear_create_blocked"
          : "linear_create_failed",
      status: "failed",
      metadataJson: JSON.stringify({ errorCode: linearResult.error }),
      occurredAt: requestedAt,
    });

    return jsonResponse({ error: linearResult.error }, 503);
  }

  await updateInquiryLinearLinkCreated(env.INQUIRY_DB, {
    id: link.id,
    status: "created",
    linearIssueId: linearResult.issue.id,
    linearIssueIdentifier: linearResult.issue.identifier,
    linearIssueUrl: linearResult.issue.url,
    approvedBy: operator,
    updatedAt: requestedAt,
  });
  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: input.value.threadId,
    messageId: input.value.messageId,
    eventType: "linear_issue_create",
    status: "created",
    metadataJson: JSON.stringify({
      linearIssueIdentifier: linearResult.issue.identifier,
    }),
    occurredAt: requestedAt,
  });

  return jsonResponse(
    {
      linearIssue: {
        status: "created",
        threadId: input.value.threadId,
        identifier: linearResult.issue.identifier,
        url: linearResult.issue.url,
        duplicate: false,
      },
    },
    existing ? 200 : 201,
  );
}

async function createDraftLink(
  env: InquiryBindings,
  input: LinearIssueRequest,
  operator: string,
  at: string,
): Promise<InquiryLinearLinkRecord> {
  const link: InquiryLinearLinkRecord = {
    id: `linear_link_${crypto.randomUUID()}`,
    threadId: input.threadId,
    messageId: input.messageId,
    status: "draft",
    mailbox: input.mailbox,
    title: input.title,
    redactedSummary: input.redactedSummary,
    linearIssueId: null,
    linearIssueIdentifier: null,
    linearIssueUrl: null,
  };

  await recordInquiryLinearLink(env.INQUIRY_DB, {
    ...link,
    createdBy: operator,
    approvedBy: null,
    lastErrorCode: null,
    createdAt: at,
    updatedAt: at,
  });
  await recordInquiryEvent(env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: input.threadId,
    messageId: input.messageId,
    eventType: "linear_issue_prepare",
    status: "draft",
    metadataJson: JSON.stringify({ linkId: link.id, mailbox: input.mailbox }),
    occurredAt: at,
  });

  return link;
}

async function createLinearIssue(
  env: InquiryBindings,
  input: LinearIssueRequest,
  operator: string,
): Promise<LinearCreateResult> {
  const apiKey = nonEmptyString(env.LINEAR_API_KEY);
  const teamId = nonEmptyString(env.HONOWARDEN_LINEAR_TEAM_ID);
  if (!apiKey || !teamId) {
    return { ok: false, error: "linear_not_configured" };
  }

  const issueInput: Record<string, unknown> = {
    teamId,
    title: input.title,
    description: buildLinearDescription(input, operator),
    priority: defaultPriority,
  };
  const projectId = nonEmptyString(env.HONOWARDEN_LINEAR_PROJECT_ID);
  if (projectId) {
    issueInput.projectId = projectId;
  }
  const labelIds = parseCsv(env.HONOWARDEN_LINEAR_DEFAULT_LABEL_IDS);
  if (labelIds.length > 0) {
    issueInput.labelIds = labelIds;
  }

  const query = `
mutation HonoWardenInquiryCreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      url
    }
  }
}
`;
  let response: Response;
  try {
    response = await fetch(
      nonEmptyString(env.HONOWARDEN_LINEAR_API_URL) ?? defaultLinearApiUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: apiKey,
        },
        body: JSON.stringify({
          query,
          variables: {
            input: issueInput,
          },
        }),
      },
    );
  } catch {
    return { ok: false, error: "linear_create_failed" };
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: {
      issueCreate?: {
        success?: boolean;
        issue?: {
          id?: unknown;
          identifier?: unknown;
          url?: unknown;
        };
      };
    };
    errors?: unknown;
  } | null;
  const issue = payload?.data?.issueCreate?.issue;
  if (
    !response.ok ||
    payload?.errors ||
    payload?.data?.issueCreate?.success !== true ||
    typeof issue?.id !== "string" ||
    typeof issue.identifier !== "string" ||
    typeof issue.url !== "string"
  ) {
    return { ok: false, error: "linear_create_failed" };
  }

  return {
    ok: true,
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    },
  };
}

function buildLinearDescription(
  input: LinearIssueRequest,
  operator: string,
): string {
  return [
    "Created from HonoWarden inquiry inbox metadata.",
    "",
    `Mailbox: ${input.mailbox}`,
    `Thread: ${input.threadId}`,
    input.messageId ? `Message: ${input.messageId}` : null,
    `Approved by: ${operator}`,
    "",
    "Redacted summary:",
    input.redactedSummary,
    "",
    "Do not paste raw email bodies, attachments, private forwarding destinations, or secret values into this issue.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function publicLinearIssue(
  link: InquiryLinearLinkRecord,
  duplicate: boolean,
): {
  status: "created";
  threadId: string;
  identifier: string | null;
  url: string | null;
  duplicate: boolean;
} {
  return {
    status: "created",
    threadId: link.threadId,
    identifier: link.linearIssueIdentifier,
    url: link.linearIssueUrl,
    duplicate,
  };
}

function validateLinearIssueInput(
  value: Record<string, unknown>,
): { ok: true; value: LinearIssueRequest } | { ok: false; error: string } {
  const threadId = requiredString(value.threadId);
  const messageId = optionalString(value.messageId);
  const mailbox = requiredString(value.mailbox);
  const title = requiredString(value.title);
  const redactedSummary = requiredString(value.redactedSummary);
  const confirmCreate = value.confirmCreate === true;

  if (!threadId || !threadId.startsWith("thread_")) {
    return { ok: false, error: "invalid_thread_id" };
  }
  if (
    !mailbox ||
    !(defaultInquiryMailboxes as readonly string[]).includes(mailbox)
  ) {
    return { ok: false, error: "invalid_mailbox" };
  }
  if (!title || title.length > 200) {
    return { ok: false, error: "invalid_title" };
  }
  if (!redactedSummary) {
    return { ok: false, error: "invalid_redacted_summary" };
  }

  return {
    ok: true,
    value: {
      threadId,
      messageId,
      mailbox,
      title,
      redactedSummary,
      confirmCreate,
    },
  };
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

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonEmptyString(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
