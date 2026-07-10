# HON-26 AI Triage And Draft Evidence

Status: Workers AI adapter deployed and verified with a synthetic staging run.

Updated: 2026-07-11.

## Scope

This repository implements the first redaction-first AI triage slice for the
HonoWarden inquiry inbox:

- `inquiry_ai_runs` D1 table for prompt version, model id, redacted context,
  classification, confidence, recommended action, tool-call output, and audit
  metadata.
- `/api/triage-runs` HTTP API gated by Cloudflare Access identity.
- Redaction of email addresses and token-like values in both subject and body
  before provider invocation, classification, persistence, or draft generation.
- Workers AI binding adapter with configurable model id, JSON Schema response
  request, strict local response validation, and fail-loud provider errors.
- Deterministic local safety policy for security reports remains authoritative
  if a model suggests a weaker classification or action.
- Draft suggestions are stored as human-reviewable `draft` rows only.
- AI-generated drafts use a redacted pending recipient and cannot be sent until
  a human replaces the recipient, edits the body, and approves the draft.

The deterministic `local-policy-v1` adapter remains available for local tests.
Staging and production are configured for Workers AI using
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`; the model id is overridable without
code changes. Autonomous sends, Linear issue creation from AI output, public
alias migration, and production triage smoke remain out of scope.

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
- `HONOWARDEN_INQUIRY_AI_PROVIDER=workers-ai` fails with an explicit 503 when
  the AI binding is absent and with 502 before persistence when invocation or
  response validation fails. There is no silent production fallback.
- Model-generated draft text is redacted again before D1 persistence.

## Verification

Local checks:

- `pnpm exec vitest run test/ai-triage.test.ts`: passed, 8 tests.
- `pnpm format`, `pnpm check`, `pnpm lint`, and `pnpm test`: passed, 54
  tests total.
- Staging migrations `0002` through `0004` applied successfully.
- Staging Worker version `408294f0-7feb-410b-a5d6-647a9a9bb37a` returned 201
  for a synthetic Access-authenticated triage request.
- Live output used model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, classified
  the request as `support_request`, required human approval, and created one
  draft and one AI run without recording raw private input in this evidence.
- An earlier live attempt returned `ai_provider_invalid_response`; D1 readback
  confirmed zero runs and drafts from that attempt. This proves provider/schema
  failures remain fail-loud and do not partially persist workflow state.

## Remaining Work

- Apply migrations `0002` through `0004` to production D1 after the staging
  checkpoint.
- Keep all external writes approval-gated.
