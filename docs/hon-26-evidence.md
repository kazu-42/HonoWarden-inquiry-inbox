# HON-26 AI Triage And Draft Evidence

Status: implemented locally; live AI provider invocation not performed.

Generated: 2026-07-09.

## Scope

This repository implements the first redaction-first AI triage slice for the
HonoWarden inquiry inbox:

- `inquiry_ai_runs` D1 table for prompt version, model id, redacted context,
  classification, confidence, recommended action, tool-call output, and audit
  metadata.
- `/api/triage-runs` HTTP API gated by Cloudflare Access identity.
- Redaction of email addresses and token-like values before classification or
  draft generation.
- Deterministic local policy adapter for security report, support request,
  abuse/postmaster, general inquiry, and noise/spam classes.
- Draft suggestions are stored as human-reviewable `draft` rows only.
- AI-generated drafts use a redacted pending recipient and cannot be sent until
  a human replaces the recipient, edits the body, and approves the draft.

Autonomous sends, live AI model calls, Linear issue creation, public alias
migration, and production triage smoke are intentionally out of scope.

## Safety Boundaries

- Security reports always require human approval.
- API responses include redacted context and tool-call output, but not raw
  message bodies, private sender addresses, or token-like values.
- D1 AI run records store `redacted_context_json`, not raw body text.
- Draft suggestions do not use the external sender address as the send target.
- Draft approval and send return `draft_recipient_required` while the placeholder
  recipient is still present.
- Confidence thresholds are configurable through
  `HONOWARDEN_INQUIRY_AI_ESCALATION_THRESHOLD`.

## Verification

Local checks:

- `pnpm exec vitest run test/ai-triage.test.ts test/migrations.test.ts`: passed, 2 files / 8 tests.
- `pnpm test`: passed, 5 files / 26 tests.
- `pnpm check`: passed.
- `pnpm lint`: passed.
- `pnpm format`: passed.

## Pending Live Work

- Apply `migrations/0003_ai_triage.sql` to staging and production D1.
- Decide whether to replace `local-policy-v1` with Workers AI or another
  provider after prompt, model, cost, and retention gates are approved.
- Run a staging-only triage smoke with synthetic content before processing real
  inbound reports.
- Keep all external writes approval-gated.
