export type InquiryThreadInput = {
  id: string;
  mailbox: string;
  threadKey: string;
  sender: string;
  senderHash: string;
  subject: string | null;
  retentionDeleteAfter: string;
  latestMessageAt: string;
  now: string;
};

export type InquiryMessageInput = {
  id: string;
  threadId: string;
  mailbox: string;
  direction: "inbound" | "outbound";
  envelopeSender: string;
  envelopeSenderHash: string;
  envelopeRecipient: string;
  headerMetadataJson: string;
  messageIdHash: string | null;
  subject: string | null;
  receivedAt: string;
  rawSizeBytes: number;
  bodyMetadataJson: string;
  attachmentCount: number;
  attachmentPolicy: string;
  rawStorageState: string;
  rawR2Key: string | null;
  deliveryStatus: string;
  retentionDeleteAfter: string;
  createdAt: string;
};

export type InquiryEventInput = {
  id: string;
  threadId: string | null;
  messageId: string | null;
  eventType: string;
  status: string;
  metadataJson: string;
  occurredAt: string;
};

export type InquiryMessageDeliveryStatusUpdateInput = {
  id: string;
  expectedStatus: "forward_pending";
  status: "forwarded" | "forward_failed";
};

export type InquiryDraftInput = {
  id: string;
  threadId: string;
  messageId: string | null;
  status: InquiryDraftStatus;
  toAddress: string;
  toAddressHash: string;
  fromAddress: string;
  replyToAddress: string;
  subject: string;
  textBody: string;
  inReplyToHash: string | null;
  referencesHash: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const inquiryDraftStatuses = [
  "draft",
  "approved",
  "rejected",
  "sending",
  "sent",
  "send_failed",
] as const;

export type InquiryDraftStatus = (typeof inquiryDraftStatuses)[number];

export type InquiryDraftRecord = {
  id: string;
  threadId: string;
  messageId: string | null;
  status: InquiryDraftStatus;
  version: number;
  toAddress: string;
  toAddressHash: string;
  fromAddress: string;
  replyToAddress: string;
  subject: string;
  textBody: string;
  inReplyToHash: string | null;
  referencesHash: string | null;
  lastErrorCode: string | null;
};

export type InquiryDraftQueueRecord = {
  id: string;
  threadId: string;
  messageId: string | null;
  status: InquiryDraftStatus;
  version: number;
  toAddressHash: string;
  subject: string;
  createdBy: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  sentBy: string | null;
  sentAt: string | null;
  providerMessageIdHash: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  linearIssueId: string | null;
  linearIssueIdentifier: string | null;
  linearIssueUrl: string | null;
};

export type InquiryDraftQueueCursor = {
  updatedAt: string;
  id: string;
};

export type InquiryDraftQueueQuery = {
  statuses: readonly InquiryDraftStatus[];
  limit: number;
  cursor: InquiryDraftQueueCursor | null;
};

export type InquiryDraftStatusUpdateInput = {
  id: string;
  expectedStatus: InquiryDraftStatus;
  expectedVersion: number;
  status: InquiryDraftStatus;
  operator: string;
  at: string;
  providerMessageIdHash?: string | null;
  lastErrorCode?: string | null;
};

export type InquiryDraftContentUpdateInput = {
  id: string;
  expectedVersion: number;
  toAddress: string;
  toAddressHash: string;
  fromAddress: string;
  replyToAddress: string;
  subject: string;
  textBody: string;
  updatedAt: string;
};

export type InquiryAiRunInput = {
  id: string;
  threadId: string;
  messageId: string | null;
  draftId: string | null;
  promptVersion: string;
  modelId: string;
  redactedContextJson: string;
  classification: string;
  confidence: number;
  recommendedAction: string;
  requiresHumanApproval: boolean;
  toolCallsJson: string;
  createdBy: string;
  createdAt: string;
};

export type InquiryLinearLinkInput = {
  id: string;
  threadId: string;
  messageId: string | null;
  status: InquiryLinearLinkStatus;
  mailbox: string;
  title: string;
  redactedSummary: string;
  linearIssueId: string | null;
  linearIssueIdentifier: string | null;
  linearIssueUrl: string | null;
  createdBy: string;
  approvedBy: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InquiryLinearLinkStatus = "draft" | "created" | "failed";

export type InquiryLinearLinkRecord = {
  id: string;
  threadId: string;
  messageId: string | null;
  status: InquiryLinearLinkStatus;
  mailbox: string;
  title: string;
  redactedSummary: string;
  linearIssueId: string | null;
  linearIssueIdentifier: string | null;
  linearIssueUrl: string | null;
};

export type InquiryLinearLinkCreatedUpdateInput = {
  id: string;
  status: "created";
  linearIssueId: string;
  linearIssueIdentifier: string;
  linearIssueUrl: string;
  approvedBy: string;
  updatedAt: string;
};

export type InquiryLinearLinkFailedUpdateInput = {
  id: string;
  lastErrorCode: string;
  approvedBy: string;
  updatedAt: string;
};

type InquiryDatabase = Pick<D1Database, "prepare">;

export type ExistingInquiryMessage = {
  id: string;
  threadId: string;
};

export async function findInquiryMessageByMessageIdHash(
  database: InquiryDatabase,
  mailbox: string,
  messageIdHash: string,
): Promise<ExistingInquiryMessage | null> {
  const row = await database
    .prepare(
      `
        SELECT id, thread_id
        FROM inquiry_messages
        WHERE mailbox = ? AND message_id_hash = ?
        LIMIT 1
      `,
    )
    .bind(mailbox, messageIdHash)
    .first<{ id: string; thread_id: string }>();

  return row ? { id: row.id, threadId: row.thread_id } : null;
}

export async function upsertInquiryThread(
  database: InquiryDatabase,
  input: InquiryThreadInput,
): Promise<void> {
  await database
    .prepare(
      `
        INSERT INTO inquiry_threads (
          id,
          mailbox,
          thread_key,
          sender,
          sender_hash,
          subject,
          retention_delete_after,
          latest_message_at,
          message_count,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(mailbox, thread_key) DO UPDATE SET
          latest_message_at = excluded.latest_message_at,
          message_count = inquiry_threads.message_count + 1,
          updated_at = excluded.updated_at
      `,
    )
    .bind(
      input.id,
      input.mailbox,
      input.threadKey,
      input.sender,
      input.senderHash,
      input.subject,
      input.retentionDeleteAfter,
      input.latestMessageAt,
      input.now,
      input.now,
    )
    .run();
}

export async function recordInquiryMessage(
  database: InquiryDatabase,
  input: InquiryMessageInput,
): Promise<void> {
  await database
    .prepare(
      `
        INSERT INTO inquiry_messages (
          id,
          thread_id,
          mailbox,
          direction,
          envelope_sender,
          envelope_sender_hash,
          envelope_recipient,
          header_metadata_json,
          message_id_hash,
          subject,
          received_at,
          raw_size_bytes,
          body_metadata_json,
          attachment_count,
          attachment_policy,
          raw_storage_state,
          raw_r2_key,
          delivery_status,
          retention_delete_after,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      input.id,
      input.threadId,
      input.mailbox,
      input.direction,
      input.envelopeSender,
      input.envelopeSenderHash,
      input.envelopeRecipient,
      input.headerMetadataJson,
      input.messageIdHash,
      input.subject,
      input.receivedAt,
      input.rawSizeBytes,
      input.bodyMetadataJson,
      input.attachmentCount,
      input.attachmentPolicy,
      input.rawStorageState,
      input.rawR2Key,
      input.deliveryStatus,
      input.retentionDeleteAfter,
      input.createdAt,
    )
    .run();
}

export async function updateInquiryMessageDeliveryStatus(
  database: InquiryDatabase,
  input: InquiryMessageDeliveryStatusUpdateInput,
): Promise<boolean> {
  const result = await database
    .prepare(
      `
        UPDATE inquiry_messages
        SET delivery_status = ?
        WHERE id = ?
        AND delivery_status = ?
      `,
    )
    .bind(input.status, input.id, input.expectedStatus)
    .run();

  return result.meta.changes === 1;
}

export async function recordInquiryEvent(
  database: InquiryDatabase,
  input: InquiryEventInput,
): Promise<void> {
  await database
    .prepare(
      `
        INSERT INTO inquiry_events (
          id,
          thread_id,
          message_id,
          event_type,
          status,
          metadata_json,
          occurred_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      input.id,
      input.threadId,
      input.messageId,
      input.eventType,
      input.status,
      input.metadataJson,
      input.occurredAt,
    )
    .run();
}

export async function recordInquiryDraft(
  database: InquiryDatabase,
  input: InquiryDraftInput,
): Promise<void> {
  await database
    .prepare(
      `
        INSERT INTO inquiry_drafts (
          id,
          thread_id,
          message_id,
          status,
          to_address,
          to_address_hash,
          from_address,
          reply_to_address,
          subject,
          text_body,
          in_reply_to_hash,
          references_hash,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      input.id,
      input.threadId,
      input.messageId,
      input.status,
      input.toAddress,
      input.toAddressHash,
      input.fromAddress,
      input.replyToAddress,
      input.subject,
      input.textBody,
      input.inReplyToHash,
      input.referencesHash,
      input.createdBy,
      input.createdAt,
      input.updatedAt,
    )
    .run();
}

export async function getInquiryDraft(
  database: InquiryDatabase,
  id: string,
): Promise<InquiryDraftRecord | null> {
  const row = await database
    .prepare(
      `
        SELECT
          id,
          thread_id,
          message_id,
          status,
          version,
          to_address,
          to_address_hash,
          from_address,
          reply_to_address,
          subject,
          text_body,
          in_reply_to_hash,
          references_hash,
          last_error_code
        FROM inquiry_drafts
        WHERE id = ?
      `,
    )
    .bind(id)
    .first<InquiryDraftRow>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    threadId: row.thread_id,
    messageId: row.message_id,
    status: row.status,
    version: row.version,
    toAddress: row.to_address,
    toAddressHash: row.to_address_hash,
    fromAddress: row.from_address,
    replyToAddress: row.reply_to_address,
    subject: row.subject,
    textBody: row.text_body,
    inReplyToHash: row.in_reply_to_hash,
    referencesHash: row.references_hash,
    lastErrorCode: row.last_error_code,
  };
}

export async function listInquiryDraftQueue(
  database: InquiryDatabase,
  input: InquiryDraftQueueQuery,
): Promise<InquiryDraftQueueRecord[]> {
  const statusPlaceholders = input.statuses.map(() => "?").join(", ");
  const cursorClause = input.cursor
    ? `
        AND (
          d.updated_at < ?
          OR (d.updated_at = ? AND d.id < ?)
        )
      `
    : "";
  const cursorBindings = input.cursor
    ? [input.cursor.updatedAt, input.cursor.updatedAt, input.cursor.id]
    : [];
  const result = await database
    .prepare(
      `
        SELECT
          d.id,
          d.thread_id,
          d.message_id,
          d.status,
          d.version,
          d.to_address_hash,
          d.subject,
          d.created_by,
          d.approved_by,
          d.rejected_by,
          d.sent_by,
          d.sent_at,
          d.provider_message_id_hash,
          d.last_error_code,
          d.created_at,
          d.updated_at,
          links.linear_issue_id,
          links.linear_issue_identifier,
          links.linear_issue_url
        FROM inquiry_drafts AS d
        LEFT JOIN inquiry_linear_links AS links
          ON links.thread_id = d.thread_id
        WHERE d.status IN (${statusPlaceholders})
        ${cursorClause}
        ORDER BY d.updated_at DESC, d.id DESC
        LIMIT ?
      `,
    )
    .bind(...input.statuses, ...cursorBindings, input.limit)
    .all<InquiryDraftQueueRow>();

  return result.results.map(mapInquiryDraftQueueRow);
}

export async function getInquiryDraftQueueItem(
  database: InquiryDatabase,
  id: string,
): Promise<InquiryDraftQueueRecord | null> {
  const row = await database
    .prepare(
      `
        SELECT
          d.id,
          d.thread_id,
          d.message_id,
          d.status,
          d.version,
          d.to_address_hash,
          d.subject,
          d.created_by,
          d.approved_by,
          d.rejected_by,
          d.sent_by,
          d.sent_at,
          d.provider_message_id_hash,
          d.last_error_code,
          d.created_at,
          d.updated_at,
          links.linear_issue_id,
          links.linear_issue_identifier,
          links.linear_issue_url
        FROM inquiry_drafts AS d
        LEFT JOIN inquiry_linear_links AS links
          ON links.thread_id = d.thread_id
        WHERE d.id = ?
      `,
    )
    .bind(id)
    .first<InquiryDraftQueueRow>();

  return row ? mapInquiryDraftQueueRow(row) : null;
}

export async function updateInquiryDraftStatus(
  database: InquiryDatabase,
  input: InquiryDraftStatusUpdateInput,
): Promise<boolean> {
  const result = await database
    .prepare(
      `
        UPDATE inquiry_drafts SET
          status = ?,
          approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
          rejected_by = CASE WHEN ? = 'rejected' THEN ? ELSE rejected_by END,
          sent_by = CASE WHEN ? IN ('sending', 'sent', 'send_failed') THEN ? ELSE sent_by END,
          sent_at = CASE
            WHEN ? = 'sent' THEN ?
            WHEN ? = 'sending' THEN NULL
            ELSE sent_at
          END,
          provider_message_id_hash = CASE WHEN ? = 'sending' THEN NULL ELSE ? END,
          last_error_code = CASE WHEN ? = 'sending' THEN NULL ELSE ? END,
          updated_at = ?,
          version = version + 1
        WHERE id = ?
        AND status = ?
        AND version = ?
      `,
    )
    .bind(
      input.status,
      input.status,
      input.operator,
      input.status,
      input.operator,
      input.status,
      input.operator,
      input.status,
      input.at,
      input.status,
      input.status,
      input.providerMessageIdHash ?? null,
      input.status,
      input.lastErrorCode ?? null,
      input.at,
      input.id,
      input.expectedStatus,
      input.expectedVersion,
    )
    .run();

  return result.meta.changes === 1;
}

export async function updateInquiryDraftContent(
  database: InquiryDatabase,
  input: InquiryDraftContentUpdateInput,
): Promise<boolean> {
  const result = await database
    .prepare(
      `
        UPDATE inquiry_drafts SET
          to_address = ?,
          to_address_hash = ?,
          from_address = ?,
          reply_to_address = ?,
          subject = ?,
          text_body = ?,
          updated_at = ?,
          version = version + 1
        WHERE id = ?
        AND status = 'draft'
        AND version = ?
      `,
    )
    .bind(
      input.toAddress,
      input.toAddressHash,
      input.fromAddress,
      input.replyToAddress,
      input.subject,
      input.textBody,
      input.updatedAt,
      input.id,
      input.expectedVersion,
    )
    .run();

  return result.meta.changes === 1;
}

export async function recordInquiryAiRun(
  database: InquiryDatabase,
  input: InquiryAiRunInput,
): Promise<void> {
  await database
    .prepare(
      `
        INSERT INTO inquiry_ai_runs (
          id,
          thread_id,
          message_id,
          draft_id,
          prompt_version,
          model_id,
          redacted_context_json,
          classification,
          confidence,
          recommended_action,
          requires_human_approval,
          tool_calls_json,
          created_by,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      input.id,
      input.threadId,
      input.messageId,
      input.draftId,
      input.promptVersion,
      input.modelId,
      input.redactedContextJson,
      input.classification,
      input.confidence,
      input.recommendedAction,
      input.requiresHumanApproval ? 1 : 0,
      input.toolCallsJson,
      input.createdBy,
      input.createdAt,
    )
    .run();
}

export async function getInquiryLinearLinkByThread(
  database: InquiryDatabase,
  threadId: string,
): Promise<InquiryLinearLinkRecord | null> {
  const row = await database
    .prepare(
      `
        SELECT
          id,
          thread_id,
          message_id,
          status,
          mailbox,
          title,
          redacted_summary,
          linear_issue_id,
          linear_issue_identifier,
          linear_issue_url
        FROM inquiry_linear_links
        WHERE thread_id = ?
      `,
    )
    .bind(threadId)
    .first<InquiryLinearLinkRow>();

  return row ? mapInquiryLinearLink(row) : null;
}

export async function recordInquiryLinearLink(
  database: InquiryDatabase,
  input: InquiryLinearLinkInput,
): Promise<void> {
  await database
    .prepare(
      `
        INSERT INTO inquiry_linear_links (
          id,
          thread_id,
          message_id,
          status,
          mailbox,
          title,
          redacted_summary,
          linear_issue_id,
          linear_issue_identifier,
          linear_issue_url,
          created_by,
          approved_by,
          last_error_code,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      input.id,
      input.threadId,
      input.messageId,
      input.status,
      input.mailbox,
      input.title,
      input.redactedSummary,
      input.linearIssueId,
      input.linearIssueIdentifier,
      input.linearIssueUrl,
      input.createdBy,
      input.approvedBy,
      input.lastErrorCode,
      input.createdAt,
      input.updatedAt,
    )
    .run();
}

export async function updateInquiryLinearLinkCreated(
  database: InquiryDatabase,
  input: InquiryLinearLinkCreatedUpdateInput,
): Promise<void> {
  await database
    .prepare(
      `
        UPDATE inquiry_linear_links SET
          status = ?,
          linear_issue_id = ?,
          linear_issue_identifier = ?,
          linear_issue_url = ?,
          approved_by = ?,
          last_error_code = NULL,
          updated_at = ?
        WHERE id = ?
      `,
    )
    .bind(
      input.status,
      input.linearIssueId,
      input.linearIssueIdentifier,
      input.linearIssueUrl,
      input.approvedBy,
      input.updatedAt,
      input.id,
    )
    .run();
}

export async function updateInquiryLinearLinkFailed(
  database: InquiryDatabase,
  input: InquiryLinearLinkFailedUpdateInput,
): Promise<void> {
  await database
    .prepare(
      `
        UPDATE inquiry_linear_links SET
          status = 'failed',
          approved_by = ?,
          last_error_code = ?,
          updated_at = ?
        WHERE id = ?
      `,
    )
    .bind(input.approvedBy, input.lastErrorCode, input.updatedAt, input.id)
    .run();
}

function mapInquiryLinearLink(
  row: InquiryLinearLinkRow,
): InquiryLinearLinkRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    messageId: row.message_id,
    status: row.status,
    mailbox: row.mailbox,
    title: row.title,
    redactedSummary: row.redacted_summary,
    linearIssueId: row.linear_issue_id,
    linearIssueIdentifier: row.linear_issue_identifier,
    linearIssueUrl: row.linear_issue_url,
  };
}

function mapInquiryDraftQueueRow(
  row: InquiryDraftQueueRow,
): InquiryDraftQueueRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    messageId: row.message_id,
    status: row.status,
    version: row.version,
    toAddressHash: row.to_address_hash,
    subject: row.subject,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    rejectedBy: row.rejected_by,
    sentBy: row.sent_by,
    sentAt: row.sent_at,
    providerMessageIdHash: row.provider_message_id_hash,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linearIssueId: row.linear_issue_id,
    linearIssueIdentifier: row.linear_issue_identifier,
    linearIssueUrl: row.linear_issue_url,
  };
}

type InquiryDraftRow = {
  id: string;
  thread_id: string;
  message_id: string | null;
  status: InquiryDraftStatus;
  version: number;
  to_address: string;
  to_address_hash: string;
  from_address: string;
  reply_to_address: string;
  subject: string;
  text_body: string;
  in_reply_to_hash: string | null;
  references_hash: string | null;
  last_error_code: string | null;
};

type InquiryDraftQueueRow = {
  id: string;
  thread_id: string;
  message_id: string | null;
  status: InquiryDraftStatus;
  version: number;
  to_address_hash: string;
  subject: string;
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
};

type InquiryLinearLinkRow = {
  id: string;
  thread_id: string;
  message_id: string | null;
  status: InquiryLinearLinkStatus;
  mailbox: string;
  title: string;
  redacted_summary: string;
  linear_issue_id: string | null;
  linear_issue_identifier: string | null;
  linear_issue_url: string | null;
};
