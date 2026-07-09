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

export type InquiryDraftStatus =
  "draft" | "approved" | "rejected" | "sent" | "send_failed";

export type InquiryDraftRecord = {
  id: string;
  threadId: string;
  messageId: string | null;
  status: InquiryDraftStatus;
  toAddress: string;
  fromAddress: string;
  replyToAddress: string;
  subject: string;
  textBody: string;
  inReplyToHash: string | null;
  referencesHash: string | null;
};

export type InquiryDraftStatusUpdateInput = {
  id: string;
  status: InquiryDraftStatus;
  operator: string;
  at: string;
  providerMessageIdHash?: string | null;
  lastErrorCode?: string | null;
};

export type InquiryDraftContentUpdateInput = {
  id: string;
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
          to_address,
          from_address,
          reply_to_address,
          subject,
          text_body,
          in_reply_to_hash,
          references_hash
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
    toAddress: row.to_address,
    fromAddress: row.from_address,
    replyToAddress: row.reply_to_address,
    subject: row.subject,
    textBody: row.text_body,
    inReplyToHash: row.in_reply_to_hash,
    referencesHash: row.references_hash,
  };
}

export async function updateInquiryDraftStatus(
  database: InquiryDatabase,
  input: InquiryDraftStatusUpdateInput,
): Promise<void> {
  await database
    .prepare(
      `
        UPDATE inquiry_drafts SET
          status = ?,
          approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
          rejected_by = CASE WHEN ? = 'rejected' THEN ? ELSE rejected_by END,
          sent_by = CASE WHEN ? IN ('sent', 'send_failed') THEN ? ELSE sent_by END,
          sent_at = CASE WHEN ? IN ('sent', 'send_failed') THEN ? ELSE sent_at END,
          provider_message_id_hash = ?,
          last_error_code = ?,
          updated_at = ?
        WHERE id = ?
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
      input.providerMessageIdHash ?? null,
      input.lastErrorCode ?? null,
      input.at,
      input.id,
    )
    .run();
}

export async function updateInquiryDraftContent(
  database: InquiryDatabase,
  input: InquiryDraftContentUpdateInput,
): Promise<void> {
  await database
    .prepare(
      `
        UPDATE inquiry_drafts SET
          to_address = ?,
          to_address_hash = ?,
          from_address = ?,
          reply_to_address = ?,
          subject = ?,
          text_body = ?,
          updated_at = ?
        WHERE id = ?
        AND status = 'draft'
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
    )
    .run();
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

type InquiryDraftRow = {
  id: string;
  thread_id: string;
  message_id: string | null;
  status: InquiryDraftStatus;
  to_address: string;
  from_address: string;
  reply_to_address: string;
  subject: string;
  text_body: string;
  in_reply_to_hash: string | null;
  references_hash: string | null;
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
