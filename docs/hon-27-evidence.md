# HON-27 Linear Issue Workflow Evidence

Status: implemented locally; live Linear issue creation not performed.

Generated: 2026-07-09.

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
  passed, 2 files / 12 tests.

Required PR checks:

- `pnpm test`
- `pnpm check`
- `pnpm lint`
- `pnpm format`
- `git diff --check`

## Pending Live Work

- Apply `migrations/0004_linear_links.sql` to staging and production D1.
- Set `LINEAR_API_KEY` as a Worker secret and configure the target team id only
  after a live write window is approved.
- Run a staging-only Linear create smoke with synthetic/redacted content.
- Record Linear issue id/URL, D1 link readback, and event readback without
  message bodies or private sender data.
- Keep AI-triggered Linear writes disabled until an explicit automation policy
  is approved.
