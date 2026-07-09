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
- Never commit message bodies, attachment contents, private forwarding
  destinations, or mailbox contents to git.

Outbound replies, AI triage, and Linear issue creation are separate follow-up
phases.

## References

- Cloudflare Email Service route email handler:
  <https://developers.cloudflare.com/email-service/api/route-emails/email-handler/>
- Cloudflare local Email Routing test endpoint:
  <https://developers.cloudflare.com/email-service/local-development/routing/>
- Cloudflare Agentic Inbox reference application:
  <https://github.com/cloudflare/agentic-inbox>
- Field report referenced by the HonoWarden operator:
  <https://blog.sh1ma.dev/articles/20260706_cloudflare_agentic_inbox/>
