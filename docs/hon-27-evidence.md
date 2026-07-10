# HON-27 Linear Issue Workflow Evidence

Status: deployed and verified with duplicate-safe synthetic issue creation.

Updated: 2026-07-11.

## Scope

This repository implements the first Linear workflow slice for the HonoWarden
inquiry inbox:

- `inquiry_linear_links` D1 table for redacted thread-to-Linear mappings.
- Access-identity-gated `/api/linear-issues` HTTP API.
- Draft link preparation without calling Linear.
- Explicit `confirmCreate: true` gate before any Linear `issueCreate` call.
- Duplicate detection by `thread_id`, returning the existing linked issue
  instead of creating noise.
- Append-only inquiry events for prepare, duplicate, create, blocked, and
  failure states.
- Redacted Linear issue descriptions that include mailbox, thread, optional
  message id, operator identity, and redacted summary only.

The adapter does not close Linear issues, delete inbox data, send external
email, process raw MIME bodies, or create issues autonomously from AI output.

## Safety Boundaries

- Every endpoint call requires a Cloudflare Access identity or explicit
  operator header.
- `confirmCreate: true` is required for external Linear writes.
- `LINEAR_API_KEY` and `HONOWARDEN_LINEAR_TEAM_ID` must be configured before
  create; otherwise the endpoint returns `linear_not_configured`.
- API responses do not echo redacted summaries, provider errors, Linear API
  keys, raw email bodies, private forwarding destinations, or mailbox content.
- D1 stores redacted summaries for operator review, not raw message bodies.
- Duplicate detection uses the local D1 link table before any external write.

## Configuration

Required for live Linear issue creation:

| Name                                  | Purpose                                 |
| ------------------------------------- | --------------------------------------- |
| `LINEAR_API_KEY`                      | Worker secret for Linear GraphQL writes |
| `HONOWARDEN_LINEAR_TEAM_ID`           | Target Linear team id                   |
| `HONOWARDEN_LINEAR_PROJECT_ID`        | Optional target project id              |
| `HONOWARDEN_LINEAR_DEFAULT_LABEL_IDS` | Optional comma-separated label ids      |
| `HONOWARDEN_LINEAR_API_URL`           | Optional test endpoint override         |

`LINEAR_API_KEY` must be stored as a Worker secret or local ignored
environment value. It must not be committed, logged, or returned in API
responses.

## Verification

Local checks:

- `pnpm exec vitest run test/linear-issues.test.ts test/migrations.test.ts`:
  passed.
- Full repository gate: format, typecheck, lint, and 56 tests passed.

Required PR checks:

- `pnpm test`
- `pnpm check`
- `pnpm lint`
- `pnpm format`
- `git diff --check`

## Live Evidence

- Migration `0004_linear_links.sql` is applied in staging and production.
- `LINEAR_API_KEY` is installed as a Worker secret in both environments; only
  the secret name was read back.
- PR #13 configured the HonoWarden team, `Website and Domain` project, and the
  existing website, operations, and feature labels.
- Staging Worker `f7faacec-58c1-48c5-abce-6a39a1c0f8d4` created synthetic
  issue `HON-77` after an Access-authenticated request with
  `confirmCreate: true`.
- Repeating the same thread request returned `HON-77` with `duplicate: true`;
  no second Linear issue was created.
- D1 readback recorded one created link, one `linear_issue_create` event, and
  one `linear_duplicate` event. The redacted summary, secret, private address,
  and raw message body were not copied into this evidence.
- Synthetic issue `HON-77` was moved to Canceled after verification.
- Production Worker `83bd1177-2c22-43cc-8a68-107677b0eef8` has the same
  target configuration. No production Linear issue was created.

AI-triggered Linear writes remain disabled. External creation still requires
an explicit authenticated request with `confirmCreate: true`.
