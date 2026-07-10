# HON-75 Cloudflare Access Authentication Evidence

Status: implementation, Access applications, deployment, and live readback
complete.

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

Access service-token JWTs use `common_name` instead of `email`. The Worker
accepts that path only when the verified claim exactly matches
`HONOWARDEN_ACCESS_SERVICE_CLIENT_ID`, then records the fixed identity
`service:inquiry-automation` rather than the raw client id.

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

## Live Deployment Evidence

- Custom domains are active at `inbox-staging.honowarden.com` and
  `inbox.honowarden.com`; `workers_dev` and preview URLs remain disabled.
- Staging Worker version: `2f6b920a-a80a-4524-89ee-043b6dafe4c2`.
- Production Worker version: `b0f626ad-701d-4981-9627-4d2a4ef496c0`.
- Both domains return 302 to Cloudflare Access without credentials.
- The exact configured service identity returns 200 from `/health` and reaches
  protected API validation (`400 invalid_thread_id`) on both domains.
- The one-time service-token material is stored outside the repository with
  mode 0600. Only its fixed, verified client identity is accepted by the
  Worker; raw token values are not recorded here.

The account's existing Email Routing rule still targets the original
`honowarden` Worker, not this dedicated inbox Worker. HTTP hardening therefore
did not alter inbound delivery. Moving the route is tracked separately and must
include an end-to-end mail smoke before the old path is retired.

## Access Application Checkpoint

Created 2026-07-11:

| Environment | Domain                         | Application ID                         | Audience tag   | Policy decision |
| ----------- | ------------------------------ | -------------------------------------- | -------------- | --------------- |
| staging     | `inbox-staging.honowarden.com` | `9df03706-5efc-4b89-a0db-b5c976a11788` | `7a909d0eb478` | allow           |
| production  | `inbox.honowarden.com`         | `0f2d93e6-7ab3-4eef-847a-d1cc4eb0db08` | `6499d1acd654` | allow           |

Each application has one exact-operator-email allow policy. The email value is
not recorded here. Team-domain and audience values are stored as Worker secrets
for both environments; secret-list readback records names only.
