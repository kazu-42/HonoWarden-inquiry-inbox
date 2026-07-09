import PostalMime from "postal-mime";

import type { InquiryBindings } from "./bindings";
import { defaultInquiryMailboxes } from "./bindings";
import {
  recordInquiryEvent,
  recordInquiryMessage,
  upsertInquiryThread,
} from "./repository";

export type InquiryEmailMessage = {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  setReject(reason: string): void;
  forward(recipient: string, headers?: Headers): Promise<unknown>;
};

export type InquiryEmailResult = {
  status:
    | "stored_metadata"
    | "forwarded"
    | "rejected_recipient"
    | "rejected_attachments"
    | "rejected_size";
  mailbox: string | null;
  messageId: string | null;
  threadId: string | null;
};

type ParsedEmailMetadata = {
  subject: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  hasText: boolean;
  hasHtml: boolean;
  textBytes: number;
  htmlBytes: number;
  attachmentCount: number;
};

const defaultMaxBytes = 256 * 1024;
const defaultRetentionDays = 365;
const textEncoder = new TextEncoder();

export async function handleInquiryEmail(
  message: InquiryEmailMessage,
  env: InquiryBindings,
  now = new Date(),
): Promise<InquiryEmailResult> {
  const recipient = normalizeEmailAddress(message.to);
  const mailbox = resolveAllowedMailbox(
    recipient,
    env.HONOWARDEN_INQUIRY_MAILBOXES,
  );

  if (!mailbox) {
    message.setReject("recipient is not accepted by this inbox");
    return {
      status: "rejected_recipient",
      mailbox: null,
      messageId: null,
      threadId: null,
    };
  }

  const receivedAt = now.toISOString();
  const retentionDeleteAfter = addDays(
    now,
    parsePositiveInteger(
      env.HONOWARDEN_INQUIRY_RETENTION_DAYS,
      defaultRetentionDays,
    ),
  ).toISOString();
  const maxBytes = parsePositiveInteger(
    env.HONOWARDEN_INQUIRY_MAX_BYTES,
    defaultMaxBytes,
  );
  const raw = await new Response(message.raw).arrayBuffer();

  if (raw.byteLength > maxBytes) {
    message.setReject("message exceeds the accepted size limit");
    return recordRejectedMessage({
      env,
      message,
      mailbox,
      raw,
      receivedAt,
      retentionDeleteAfter,
      status: "rejected_size",
      attachmentCount: 0,
      attachmentPolicy: "not_inspected",
      eventType: "reject_size",
    });
  }

  const parsed = await parseEmailMetadata(raw);

  if (parsed.attachmentCount > 0) {
    message.setReject("attachments are not accepted by this inbox");
    return recordRejectedMessage({
      env,
      message,
      mailbox,
      raw,
      receivedAt,
      retentionDeleteAfter,
      status: "rejected_attachments",
      attachmentCount: parsed.attachmentCount,
      attachmentPolicy: "rejected",
      eventType: "reject_attachment",
      parsed,
    });
  }

  const stored = await recordInboundMetadata({
    env,
    message,
    mailbox,
    raw,
    receivedAt,
    retentionDeleteAfter,
    deliveryStatus: resolveForwardRecipient(mailbox, env)
      ? "forward_pending"
      : "stored_metadata",
    attachmentCount: 0,
    attachmentPolicy: "rejected",
    parsed,
  });

  const forwardTo = resolveForwardRecipient(mailbox, env);
  if (forwardTo) {
    await message.forward(forwardTo);
    await recordInquiryEvent(env.INQUIRY_DB, {
      id: crypto.randomUUID(),
      threadId: stored.threadId,
      messageId: stored.messageId,
      eventType: "forward",
      status: "success",
      metadataJson: JSON.stringify({ recipient: "configured_destination" }),
      occurredAt: receivedAt,
    });

    return {
      status: "forwarded",
      mailbox,
      messageId: stored.messageId,
      threadId: stored.threadId,
    };
  }

  return {
    status: "stored_metadata",
    mailbox,
    messageId: stored.messageId,
    threadId: stored.threadId,
  };
}

async function recordRejectedMessage(input: {
  env: InquiryBindings;
  message: InquiryEmailMessage;
  mailbox: string;
  raw: ArrayBuffer;
  receivedAt: string;
  retentionDeleteAfter: string;
  status: "rejected_attachments" | "rejected_size";
  attachmentCount: number;
  attachmentPolicy: string;
  eventType: string;
  parsed?: ParsedEmailMetadata;
}): Promise<InquiryEmailResult> {
  const stored = await recordInboundMetadata({
    env: input.env,
    message: input.message,
    mailbox: input.mailbox,
    raw: input.raw,
    receivedAt: input.receivedAt,
    retentionDeleteAfter: input.retentionDeleteAfter,
    deliveryStatus: input.status,
    attachmentCount: input.attachmentCount,
    attachmentPolicy: input.attachmentPolicy,
    parsed: input.parsed ?? null,
  });

  await recordInquiryEvent(input.env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId: stored.threadId,
    messageId: stored.messageId,
    eventType: input.eventType,
    status: "success",
    metadataJson: JSON.stringify({
      attachmentCount: input.attachmentCount,
      rawSizeBytes: input.raw.byteLength,
    }),
    occurredAt: input.receivedAt,
  });

  return {
    status: input.status,
    mailbox: input.mailbox,
    messageId: stored.messageId,
    threadId: stored.threadId,
  };
}

async function recordInboundMetadata(input: {
  env: InquiryBindings;
  message: InquiryEmailMessage;
  mailbox: string;
  raw: ArrayBuffer;
  receivedAt: string;
  retentionDeleteAfter: string;
  deliveryStatus: string;
  attachmentCount: number;
  attachmentPolicy: string;
  parsed: ParsedEmailMetadata | null;
}): Promise<{ threadId: string; messageId: string }> {
  const parsed = input.parsed ?? (await parseEmailMetadata(input.raw));
  const sender = normalizeEmailAddress(input.message.from);
  const senderHash = await sha256Hex(sender);
  const messageIdHash = parsed.messageId
    ? await sha256Hex(parsed.messageId)
    : null;
  const replyThreadId = resolveReplyThreadId(
    normalizeEmailAddress(input.message.to),
    input.mailbox,
  );
  const threadKey =
    replyThreadId !== null
      ? `reply:${replyThreadId}`
      : await buildThreadKey(input.mailbox, sender, parsed);
  const threadId =
    replyThreadId ??
    `thread_${await sha256Hex(`${input.mailbox}:${threadKey}`)}`;
  const inquiryMessageId = `message_${crypto.randomUUID()}`;
  const headerMetadataJson = await buildHeaderMetadataJson(
    input.message.headers,
  );
  const bodyMetadataJson = JSON.stringify({
    hasText: parsed.hasText,
    hasHtml: parsed.hasHtml,
    textBytes: parsed.textBytes,
    htmlBytes: parsed.htmlBytes,
    storage: "metadata_only",
  });

  await upsertInquiryThread(input.env.INQUIRY_DB, {
    id: threadId,
    mailbox: input.mailbox,
    threadKey,
    sender,
    senderHash,
    subject: sanitizePreview(parsed.subject),
    retentionDeleteAfter: input.retentionDeleteAfter,
    latestMessageAt: input.receivedAt,
    now: input.receivedAt,
  });

  await recordInquiryMessage(input.env.INQUIRY_DB, {
    id: inquiryMessageId,
    threadId,
    mailbox: input.mailbox,
    direction: "inbound",
    envelopeSender: sender,
    envelopeSenderHash: senderHash,
    envelopeRecipient: normalizeEmailAddress(input.message.to),
    headerMetadataJson,
    messageIdHash,
    subject: sanitizePreview(parsed.subject),
    receivedAt: input.receivedAt,
    rawSizeBytes: input.raw.byteLength,
    bodyMetadataJson,
    attachmentCount: input.attachmentCount,
    attachmentPolicy: input.attachmentPolicy,
    rawStorageState: "disabled",
    rawR2Key: null,
    deliveryStatus: input.deliveryStatus,
    retentionDeleteAfter: input.retentionDeleteAfter,
    createdAt: input.receivedAt,
  });

  await recordInquiryEvent(input.env.INQUIRY_DB, {
    id: crypto.randomUUID(),
    threadId,
    messageId: inquiryMessageId,
    eventType: "receive",
    status: input.deliveryStatus,
    metadataJson: JSON.stringify({
      mailbox: input.mailbox,
      rawSizeBytes: input.raw.byteLength,
      attachmentCount: input.attachmentCount,
      rawStorageState: "disabled",
    }),
    occurredAt: input.receivedAt,
  });

  return {
    threadId,
    messageId: inquiryMessageId,
  };
}

async function parseEmailMetadata(
  raw: ArrayBuffer,
): Promise<ParsedEmailMetadata> {
  const parser = new PostalMime();
  const parsed = await parser.parse(raw);

  return {
    subject: stringOrNull(parsed.subject),
    messageId: stringOrNull(parsed.messageId),
    inReplyTo: stringOrNull(parsed.inReplyTo),
    references: Array.isArray(parsed.references)
      ? parsed.references.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    hasText: Boolean(parsed.text),
    hasHtml: Boolean(parsed.html),
    textBytes: parsed.text ? textEncoder.encode(parsed.text).byteLength : 0,
    htmlBytes: parsed.html ? textEncoder.encode(parsed.html).byteLength : 0,
    attachmentCount: parsed.attachments?.length ?? 0,
  };
}

async function buildThreadKey(
  mailbox: string,
  sender: string,
  parsed: ParsedEmailMetadata,
): Promise<string> {
  const reference =
    parsed.inReplyTo ?? parsed.references.at(-1) ?? parsed.messageId ?? null;

  if (reference) {
    return `ref:${await sha256Hex(reference)}`;
  }

  return `fallback:${await sha256Hex(
    `${mailbox}:${sender}:${parsed.subject?.toLowerCase() ?? ""}`,
  )}`;
}

async function buildHeaderMetadataJson(headers: Headers): Promise<string> {
  const headerNames = [...headers.keys()]
    .map((name) => name.toLowerCase())
    .sort();
  const hashedHeaders: Record<string, string> = {};

  for (const name of [
    "from",
    "to",
    "cc",
    "reply-to",
    "message-id",
    "in-reply-to",
    "references",
  ]) {
    const value = headers.get(name);
    if (value) {
      hashedHeaders[name] = await sha256Hex(value);
    }
  }

  return JSON.stringify({
    names: headerNames,
    valueHashes: hashedHeaders,
  });
}

export function resolveAllowedMailbox(
  recipient: string,
  configuredMailboxes: string | undefined,
): string | null {
  const [localPart, domain] = recipient.split("@");
  if (!localPart || !domain || domain !== "honowarden.com") {
    return null;
  }
  const mailbox = localPart.split("+", 1)[0];
  if (!mailbox) {
    return null;
  }

  const allowed = new Set(
    (configuredMailboxes ?? defaultInquiryMailboxes.join(","))
      .split(",")
      .map((mailbox) => mailbox.trim().toLowerCase())
      .filter(Boolean),
  );

  return allowed.has(mailbox) ? mailbox : null;
}

function resolveReplyThreadId(
  recipient: string,
  mailbox: string,
): string | null {
  const [localPart, domain] = recipient.split("@");
  if (domain !== "honowarden.com" || !localPart) {
    return null;
  }

  const [recipientMailbox, subaddress] = localPart.split("+", 2);
  if (recipientMailbox !== mailbox || !subaddress) {
    return null;
  }

  return /^thread_[a-zA-Z0-9_-]+$/.test(subaddress) ? subaddress : null;
}

function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalEmailAddress(
  value: string | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function resolveForwardRecipient(
  mailbox: string,
  env: InquiryBindings,
): string | null {
  const mailboxDestinations: Record<string, string | undefined> = {
    abuse: env.HONOWARDEN_ABUSE_FORWARD_TO,
    admin: env.HONOWARDEN_ADMIN_FORWARD_TO,
    hello: env.HONOWARDEN_HELLO_FORWARD_TO ?? env.HONOWARDEN_GENERAL_FORWARD_TO,
    postmaster: env.HONOWARDEN_POSTMASTER_FORWARD_TO,
    security: env.HONOWARDEN_SECURITY_FORWARD_TO,
    support: env.HONOWARDEN_SUPPORT_FORWARD_TO,
  };

  return normalizeOptionalEmailAddress(
    mailboxDestinations[mailbox] ?? env.HONOWARDEN_INQUIRY_FORWARD_TO,
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizePreview(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, 200);
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
