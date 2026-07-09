# HON-25 Human-Approved Reply Evidence

Status: implemented locally; live outbound send not performed.

Generated: 2026-07-09.

## Scope

This repository implements the first outbound reply slice for the HonoWarden
inquiry inbox:

- `inquiry_drafts` D1 table for draft, approved, rejected, sent, and
  send-failed states.
- Access-identity-gated HTTP APIs for draft create, edit, approve, reject, and
  send.
- Cloudflare Email Service `send_email` binding configuration named `EMAIL`
  with allowed HonoWarden sender addresses.
- Reply-To subaddressing in the form `mailbox+thread_id@honowarden.com`.
- Inbound plus-address routing back to the existing `thread_id`.
- Append-only audit events for draft create, edit, approval, rejection, and
  send.

AI draft generation, autonomous sending, Linear issue creation, public alias
migration, and production outbound smoke are intentionally out of scope.

## Safety Boundaries

- The API requires a Cloudflare Access identity header before mutating drafts or
  sending.
- Draft bodies are not returned in API responses.
- Send evidence records provider message id hashes, not provider message ids.
- Repository files do not contain API keys, tokens, private forwarding
  destinations, live message bodies, or attachment contents.
- `wrangler dev` remote email sending is not enabled in repo configuration.

## Verification

Local checks:

- `pnpm exec vitest run test/migrations.test.ts test/outbound-replies.test.ts test/inquiry-mail.test.ts test/repository.test.ts`: passed, 4 files / 22 tests.
- `pnpm test`: passed, 4 files / 22 tests.
- `pnpm check`: passed.
- `pnpm lint`: passed.
- `pnpm format`: passed.

## Pending Live Work

- Apply `migrations/0002_inquiry_replies.sql` to staging and production D1.
- Deploy the Worker with the `EMAIL` binding after Email Sending domain
  readiness is confirmed.
- Run a live outbound smoke only after an operator approves a target recipient
  and confirms that real email sending is expected.
- Record Cloudflare Email Sending logs and D1 readback without message bodies or
  private recipient addresses.
