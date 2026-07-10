# HON-75 Cloudflare Access Authentication Evidence

Status: implementation complete; live Access application and custom-domain
readback pending.

Updated: 2026-07-11.

## Security Boundary

All deployed `/api/*` requests are authenticated at the HTTP router boundary.
The Worker validates `Cf-Access-Jwt-Assertion` with Cloudflare Access rotating
JWKS and requires:

- RS256 signature verification;
- the configured Cloudflare Access team-domain issuer;
- the configured application audience;
- a non-expired token;
- a valid email claim for the operator identity.

The forwarded email header and the internal verified-operator header are removed
from the incoming request. Endpoint handlers receive only the operator identity
derived from the verified JWT. Missing Access configuration fails with 503;
missing, expired, wrong-audience, or bad-signature tokens fail with 401.

The development environment retains a header-only path for local tests. Any
other named environment is Access-protected by default, including misspelled or
future environment names.

## Exposure Controls

`workers_dev` and `preview_urls` are false for root, staging, and production.
The Email Routing `email()` handler remains independent from HTTP Access and can
continue receiving configured mailbox deliveries while the protected custom
domains are being provisioned.

## Verification

Unit and route coverage includes:

- valid JWT and verified email claim;
- spoofed forwarded and internal identity headers;
- missing Access configuration;
- missing JWT;
- wrong audience;
- expired JWT;
- invalid signature;
- unknown environment fail-closed behavior;
- existing development-only API behavior.

## Pending Live Work

- Create staging and production Access applications and allow policies.
- Configure protected custom domains for the two Workers.
- Store team-domain and audience values as Worker secrets.
- Deploy and prove workers.dev and preview URLs are disabled.
- Record unauthorized and authorized synthetic HTTP readbacks without JWT or
  operator-email values.
- Re-run Email Routing smoke to prove the email handler is unaffected.
