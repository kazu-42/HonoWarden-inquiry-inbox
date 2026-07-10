# HonoWarden Inquiry Inbox

Cloudflare Worker for HonoWarden inbound inquiry mail.

This repository is intentionally separate from the HonoWarden vault API Worker.
It has its own D1 database, R2 bucket, Email Routing handler, and operational
secrets so inbound contact mail cannot access vault users, token secrets, or
encrypted vault payloads.

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
