# HonoWarden Inquiry Inbox

Cloudflare Worker for HonoWarden inbound inquiry mail.

This repository is intentionally separate from the HonoWarden vault API Worker.
It has its own D1 database, R2 bucket, Email Routing handler, and operational
secrets so inbound contact mail cannot access vault users, token secrets, or
encrypted vault payloads.

All deployed HTTP API routes require a cryptographically verified Cloudflare
Access application JWT. The Worker never trusts the forwarded identity header
by itself. `workers.dev` and preview URLs remain disabled; Email Routing invokes
the separate `email()` handler without crossing the HTTP Access boundary.

## Scope

- Receive selected `honowarden.com` inquiry addresses through Cloudflare Email
  Routing.
- Keep `inquiry-smoke@honowarden.com` as a hidden live smoke route before
  switching public aliases from forwarding-only rules to Worker processing.
- Store metadata-only inbound records in D1 with retention deadlines.
- Reject attachments until R2 retention and access rules are explicitly enabled.
- Optionally forward accepted messages to a verified private destination.
- Store human-reviewed outbound reply drafts and send only explicitly approved
  drafts through the Cloudflare Email Service binding.
- Run redaction-first inquiry triage and draft suggestion generation through a
  validated Workers AI adapter without autonomous external writes.
- Require a human to replace AI placeholder recipients before approval or send.
- Prepare redacted Linear issue links and create Linear issues only after an
  explicit operator-approved request.
- Never commit message bodies, attachment contents, private forwarding
  destinations, or mailbox contents to git.

Autonomous sending and autonomous Linear writes remain out of scope. Live AI,
outbound sends, and Linear issue creation require separate synthetic smoke and
evidence records before processing real inquiries.

## Operator queue API

All routes below are protected by Cloudflare Access. Responses use a strict
redacted projection: recipient addresses, sender addresses, reply bodies, and
raw provider errors are never returned.

- `GET /api/drafts?status=draft&status=send_failed&limit=25&cursor=...` lists
  drafts newest-first. `status` may be repeated, `limit` is capped at 100, and
  `cursor` is an opaque keyset-pagination token that must be reused with the
  same status filters. Pagination reads the live queue rather than a historical
  snapshot, so a draft updated between requests can move ahead of the cursor.
- `GET /api/drafts/:id` returns one draft using the same projection.
- `PATCH /api/drafts/:id` edits a draft and requires a positive integer
  `version` in the JSON body alongside the editable fields.
- `POST /api/drafts/:id/approve`, `/reject`, and `/send` each require
  `{ "version": <positive integer> }`.
- `POST /api/drafts/:id/retry` uses the same version body and accepts only a
  `send_failed` draft whose structural error code is explicitly retryable.

Each successful mutation increments `version`; sending increments it once when
acquiring the persisted `sending` state and once at terminal completion. A
stale version returns `409 draft_version_conflict`. A row left in `sending` is
reported as stuck and is never automatically retried because provider delivery
may already have occurred.

Approve, reject, send, and retry require a human Access identity. The Access
service identity may still create drafts and triage runs. Set the optional
comma-separated `HONOWARDEN_INQUIRY_OPERATORS` variable to restrict human
authority to an explicit allowlist; unset or empty keeps all authenticated
human identities enabled.

## References

- Cloudflare Email Service route email handler:
  <https://developers.cloudflare.com/email-service/api/route-emails/email-handler/>
- Cloudflare local Email Routing test endpoint:
  <https://developers.cloudflare.com/email-service/local-development/routing/>
- Cloudflare Agentic Inbox reference application:
  <https://github.com/cloudflare/agentic-inbox>
- Field report referenced by the HonoWarden operator:
  <https://blog.sh1ma.dev/articles/20260706_cloudflare_agentic_inbox/>

## Evidence

- [HON-24 Inquiry Mailbox Storage Evidence](docs/hon-24-evidence.md)
- [HON-25 Human-Approved Reply Evidence](docs/hon-25-evidence.md)
- [HON-26 AI Triage And Draft Evidence](docs/hon-26-evidence.md)
- [HON-27 Linear Issue Workflow Evidence](docs/hon-27-evidence.md)
