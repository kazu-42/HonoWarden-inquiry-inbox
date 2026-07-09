# HON-24 Inquiry Mailbox Storage Evidence

Status: implemented with hidden live-route smoke pending.

Generated: 2026-07-09.

## Scope

This repository implements the first HonoWarden inquiry inbox storage slice:

- Cloudflare Worker `email()` handler for inbound Email Routing messages.
- Metadata-only D1 persistence for accepted inbound mail.
- Attachment rejection before raw MIME or attachment storage is enabled.
- Optional forwarding through mailbox-specific Worker secrets.
- Hidden smoke route for live Email Routing verification.

Outbound replies, AI triage, and Linear issue creation are intentionally out of
scope for this slice.

## Cloudflare Resources

Workers:

- Staging Worker: `honowarden-inquiry-inbox-staging`
- Production Worker: `honowarden-inquiry-inbox`

D1:

- Staging database: `honowarden-inquiry-staging`
- Production database: `honowarden-inquiry`
- Applied migration: `0001_inquiry_mailbox.sql`
- Readback tables: `inquiry_threads`, `inquiry_messages`, `inquiry_events`,
  `schema_migrations`

R2:

- Staging bucket: `honowarden-inquiry-staging-objects`
- Production bucket: `honowarden-inquiry-objects`
- Raw MIME and attachment object writes remain disabled by default.

Email Routing:

- Existing public routes for `security`, `support`, `hello`, `admin`,
  `postmaster`, and `abuse` remain forwarding-only.
- Hidden smoke route `inquiry-smoke@honowarden.com` points to the production
  Worker action.

Secrets:

- Mailbox-specific forwarding destinations are Worker secrets.
- Secret values and private forwarding destinations are not stored in this
  repository.

## Verification

Local code checks:

- `pnpm test`: passed, 3 files / 14 tests
- `pnpm check`: passed
- `pnpm lint`: passed
- `pnpm format`: passed

Cloudflare:

- Staging D1 remote migration: passed.
- Production D1 remote migration: passed.
- Staging schema readback: `0001`, required inquiry tables present.
- Production schema readback: `0001`, required inquiry tables present.
- Staging deploy: Worker version `5da49e8f-92e8-4833-8984-8ce0d531c6ec`.
- Production deploy: Worker version `b1edc541-1921-4525-b03b-4228b87b0133`.
- Staging health: `{"service":"honowarden-inquiry-inbox","status":"ok","environment":"staging"}`.
- Production health: `{"service":"honowarden-inquiry-inbox","status":"ok","environment":"production"}`.
- Worker secrets readback: six forwarding secret names exist for staging and
  production.
- Email Routing readback: seven enabled rules total, including six forwarding
  rules and one hidden Worker smoke rule; catch-all remains disabled/drop.

Local Email Routing smoke:

- Accepted `security@honowarden.com` RFC 5322 test message through
  `/cdn-cgi/handler/email`: HTTP 200.
- Rejected RFC 5322 attachment test message through `/cdn-cgi/handler/email`:
  HTTP 400 with attachment rejection reason.
- Local D1 readback recorded `stored_metadata` and `rejected_attachments`
  statuses.
- Local D1 body-leak query returned `0`.

## Remaining Live Smoke

Send a no-body or harmless-body test email to `inquiry-smoke@honowarden.com`.
Expected result:

- Cloudflare Email Routing activity shows Worker delivery.
- Production D1 records one `inquiry_messages` row for mailbox
  `inquiry-smoke`.
- No body content or attachment content is copied into docs, GitHub, Linear, or
  chat.

After that readback passes, public aliases can be migrated from forwarding-only
routes to Worker routes in a separate, reversible operation.
