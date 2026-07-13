PRAGMA foreign_keys = ON;

INSERT INTO inquiry_threads (
  id,
  mailbox,
  thread_key,
  sender,
  sender_hash,
  subject,
  status,
  retention_delete_after,
  latest_message_at,
  message_count,
  created_at,
  updated_at
)
VALUES
  ('thread_draft_flow', 'browser-fixture', 'key-draft-flow', 'fixture-origin@example.test', '1111111111111111111111111111111111111111111111111111111111111111', 'Synthetic pending flow', 'open', '2030-01-01T00:00:00Z', '2026-07-13T05:00:00Z', 0, '2026-07-13T05:00:00Z', '2026-07-13T05:00:00Z'),
  ('thread_retry_flow', 'browser-fixture', 'key-retry-flow', 'fixture-origin@example.test', '2222222222222222222222222222222222222222222222222222222222222222', 'Synthetic retry flow', 'open', '2030-01-01T00:00:00Z', '2026-07-13T04:00:00Z', 0, '2026-07-13T04:00:00Z', '2026-07-13T04:00:00Z'),
  ('thread_stuck_flow', 'browser-fixture', 'key-stuck-flow', 'fixture-origin@example.test', '3333333333333333333333333333333333333333333333333333333333333333', 'Synthetic investigation flow', 'open', '2030-01-01T00:00:00Z', '2026-07-13T03:00:00Z', 0, '2026-07-13T03:00:00Z', '2026-07-13T03:00:00Z'),
  ('thread_approved_sort_flow', 'browser-fixture', 'key-approved-sort-flow', 'fixture-origin@example.test', '6666666666666666666666666666666666666666666666666666666666666666', 'Synthetic ordering anchor', 'open', '2030-01-01T00:00:00Z', '2026-07-13T02:30:00Z', 0, '2026-07-13T02:30:00Z', '2026-07-13T02:30:00Z'),
  ('thread_stale_flow', 'browser-fixture', 'key-stale-flow', 'fixture-origin@example.test', '4444444444444444444444444444444444444444444444444444444444444444', 'Synthetic conflict flow', 'open', '2030-01-01T00:00:00Z', '2026-07-13T02:00:00Z', 0, '2026-07-13T02:00:00Z', '2026-07-13T02:00:00Z'),
  ('thread_unauthorized_flow', 'browser-fixture', 'key-unauthorized-flow', 'fixture-origin@example.test', '5555555555555555555555555555555555555555555555555555555555555555', 'Synthetic authorization flow', 'open', '2030-01-01T00:00:00Z', '2026-07-13T01:00:00Z', 0, '2026-07-13T01:00:00Z', '2026-07-13T01:00:00Z');

INSERT INTO inquiry_drafts (
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
  created_by,
  approved_by,
  rejected_by,
  sent_by,
  sent_at,
  provider_message_id_hash,
  last_error_code,
  created_at,
  updated_at
)
VALUES
  ('draft_flow', 'thread_draft_flow', NULL, 'draft', 1, 'fixture-recipient@example.test', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'browser-sender@example.test', 'browser-sender+draft-flow@example.test', 'Pending fixture: approve then send', '', NULL, NULL, 'fixture-builder@example.test', NULL, NULL, NULL, NULL, NULL, NULL, '2026-07-13T05:00:00Z', '2026-07-13T05:00:00Z'),
  ('retry_flow', 'thread_retry_flow', NULL, 'send_failed', 3, 'fixture-recipient@example.test', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'browser-sender@example.test', 'browser-sender+retry-flow@example.test', 'Failed fixture: retry safely', '', NULL, NULL, 'fixture-builder@example.test', 'fixture-reviewer@example.test', NULL, 'fixture-worker@example.test', NULL, NULL, 'E_PROVIDER_UNAVAILABLE', '2026-07-13T04:00:00Z', '2026-07-13T04:00:00Z'),
  ('stuck_flow', 'thread_stuck_flow', NULL, 'sending', 2, 'fixture-recipient@example.test', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'browser-sender@example.test', 'browser-sender+stuck-flow@example.test', 'Sending fixture: investigate only', '', NULL, NULL, 'fixture-builder@example.test', 'fixture-reviewer@example.test', NULL, 'fixture-worker@example.test', NULL, NULL, NULL, '2026-07-13T03:00:00Z', '2026-07-13T03:00:00Z'),
  ('approved_sort_flow', 'thread_approved_sort_flow', NULL, 'approved', 2, 'fixture-recipient@example.test', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'browser-sender@example.test', 'browser-sender+approved-sort-flow@example.test', 'Approved fixture: ordering anchor', '', NULL, NULL, 'fixture-builder@example.test', 'fixture-reviewer@example.test', NULL, NULL, NULL, NULL, NULL, '2026-07-13T02:30:00Z', '2026-07-13T02:30:00Z'),
  ('stale_flow', 'thread_stale_flow', NULL, 'draft', 1, 'fixture-recipient@example.test', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'browser-sender@example.test', 'browser-sender+stale-flow@example.test', 'Stale fixture: surface the conflict', '', NULL, NULL, 'fixture-builder@example.test', NULL, NULL, NULL, NULL, NULL, NULL, '2026-07-13T02:00:00Z', '2026-07-13T02:00:00Z'),
  ('unauthorized_flow', 'thread_unauthorized_flow', NULL, 'draft', 1, 'fixture-recipient@example.test', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'browser-sender@example.test', 'browser-sender+unauthorized-flow@example.test', 'Authorization fixture: deny mutation', '', NULL, NULL, 'fixture-builder@example.test', NULL, NULL, NULL, NULL, NULL, NULL, '2026-07-13T01:00:00Z', '2026-07-13T01:00:00Z');

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
VALUES (
  'linear_fixture_draft_flow',
  'thread_draft_flow',
  NULL,
  'created',
  'browser-fixture',
  'Synthetic browser fixture',
  'Synthetic metadata only',
  'linear-fixture-id',
  'DEMO-120',
  'https://linear.app/example/issue/DEMO-120/synthetic-browser-fixture',
  'fixture-builder@example.test',
  'fixture-reviewer@example.test',
  NULL,
  '2026-07-13T05:00:00Z',
  '2026-07-13T05:00:00Z'
);

WITH RECURSIVE fixture_numbers(value) AS (
  SELECT 1
  UNION ALL
  SELECT value + 1 FROM fixture_numbers WHERE value < 22
)
INSERT INTO inquiry_threads (
  id,
  mailbox,
  thread_key,
  sender,
  sender_hash,
  subject,
  status,
  retention_delete_after,
  latest_message_at,
  message_count,
  created_at,
  updated_at
)
SELECT
  'thread_page_' || printf('%02d', value),
  'browser-fixture',
  'key-page-' || printf('%02d', value),
  'fixture-origin@example.test',
  printf('%064d', value),
  'Synthetic pagination fixture ' || printf('%02d', value),
  'open',
  '2030-01-01T00:00:00Z',
  printf('2026-07-12T%02d:00:00Z', value),
  0,
  printf('2026-07-12T%02d:00:00Z', value),
  printf('2026-07-12T%02d:00:00Z', value)
FROM fixture_numbers;

WITH RECURSIVE fixture_numbers(value) AS (
  SELECT 1
  UNION ALL
  SELECT value + 1 FROM fixture_numbers WHERE value < 22
)
INSERT INTO inquiry_drafts (
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
  created_by,
  approved_by,
  rejected_by,
  sent_by,
  sent_at,
  provider_message_id_hash,
  last_error_code,
  created_at,
  updated_at
)
SELECT
  'page_' || printf('%02d', value),
  'thread_page_' || printf('%02d', value),
  NULL,
  'draft',
  1,
  'fixture-recipient@example.test',
  printf('%064x', value),
  'browser-sender@example.test',
  'browser-sender+page-' || printf('%02d', value) || '@example.test',
  'Pagination fixture ' || printf('%02d', value),
  '',
  NULL,
  NULL,
  'fixture-builder@example.test',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  printf('2026-07-12T%02d:00:00Z', value),
  printf('2026-07-12T%02d:00:00Z', value)
FROM fixture_numbers;
