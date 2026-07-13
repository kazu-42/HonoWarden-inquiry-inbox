# HON-120 Operator Queue Browser Surface Evidence

Status: implemented and verified locally; CI browser gate configured; live
deployment not performed.

Updated: 2026-07-13.

## Scope

This slice adds an authenticated operator queue at `/operator` as one
self-contained HTML response with inline CSS and JavaScript. It consumes the
existing redaction-safe `/api/drafts` projection and provides:

- actionable status filters selected by default;
- status grouping, newest-first API ordering, and keyset `nextCursor`
  pagination;
- approve, reject, send, and eligible retry controls with the current draft
  `version`;
- explicit 409 and uncertain-result refresh-without-retry handling;
- a needs-investigation presentation for `sending` rows with no retry control;
- non-leaking 401/403 operator messages;
- semantic landmarks, lists, labelled native controls, visible focus, text
  status, and a polite live region;
- responsive layouts verified at 1280 px and 375 px.

The Worker authentication boundary now covers exact path `/operator` in
addition to the existing `/api/` prefix. The `/api/` predicate itself is
unchanged.

## Security And Redaction Boundaries

- Production-like requests to `/operator` without a valid Cloudflare Access
  assertion return `401 access_token_required`; spoofed forwarded identity
  headers do not bypass the Worker gate.
- Local browser tests use only the documented development operator header and
  an explicit synthetic operator allowlist. Production authentication is not
  weakened.
- The page requests and renders only the HON-119 queue projection. It does not
  request, reconstruct, or render a recipient address, message body, or raw
  provider response.
- Recipient metadata is displayed only as a shortened hash. UI content is
  inserted with `textContent`, and Linear links are accepted only for HTTPS
  `linear.app` hosts.
- Every mutation sends exactly `{ "version": <current-version> }`. A 409 causes
  one detail refresh and an operator warning; the mutation is never retried
  automatically.
- A non-2xx send or retry result can arrive after the server has changed state.
  The UI therefore performs a detail read without retrying the mutation and
  reports the refreshed status. If the read also fails, the stale row is hidden
  until a full queue reload.
- A `sending` row is labelled as stuck and needs investigation. It has no retry
  control because retrying could duplicate an email.
- Browser fixtures use only synthetic `.example.test` addresses, synthetic
  identities and hashes, structural error codes, and empty `text_body` values.
  No recipient address is rendered or asserted as a complete literal in the
  browser source. Trace source embedding is disabled. Screenshots, traces, and
  axe attachments therefore contain no recipient, body, raw provider text,
  token, or secret.
- The page response is `no-store` and carries a nonce-based CSP, frame denial,
  referrer denial, a restrictive Permissions Policy, and `nosniff`.

## Versions

Local verification used:

- Node.js `v26.3.1`;
- pnpm `11.8.0`;
- Wrangler `4.107.1`;
- `@playwright/test` / Playwright `1.60.0`;
- `@axe-core/playwright` and `axe-core` `4.11.1`;
- Google Chrome for Testing `148.0.7778.96` (Playwright Chromium revision
  1223);
- macOS arm64.

CI remains pinned to Node.js 24 and installs the declared dependencies with
`pnpm install --frozen-lockfile`.

## Verification

Local results:

- `pnpm test`: passed, 10 files / 120 tests. This includes the new Worker-level
  unauthenticated `/operator` rejection and authenticated HTML response tests.
- `pnpm test:browser`: passed, 1 Chromium test with 5 named workflow steps.
- `pnpm lint`: passed.
- `pnpm check`: passed.
- `pnpm format`: passed.
- `wrangler deploy --dry-run --config test/browser/wrangler.jsonc`: passed and
  reported the isolated D1, local Email, development environment, and synthetic
  operator allowlist bindings.

The browser suite has one worker, no retry, a fresh seeded database per run,
and no remote binding. This prevents shared-state races and prevents a flaky
rerun from hiding a consumptive send or retry failure.

## Browser Workflows Exercised

The real Worker router, queue repository queries, authentication path, mutation
handlers, and UI JavaScript were exercised for:

1. Default `draft`, `approved`, `send_failed`, and `sending` filters; 25 initial
   rows; newest-first ordering within status groups; then `nextCursor` load-more
   to 28 rows and a hidden terminal pagination control.
2. Keyboard focus plus Enter activation of refresh, visible native action
   controls, action-result focus recovery, a safe Linear issue link, shortened
   recipient hashes, and absence of fixture addresses or forbidden response
   fields from both the API payload and rendered page.
3. `draft` version 1 to `approved` version 2, followed by send with version 2 to
   `sent` version 4. Captured request bodies were exactly `{ version: 1 }` and
   `{ version: 2 }`.
4. Retryable `send_failed` version 3 with `E_PROVIDER_UNAVAILABLE` through
   retry to `sent` version 5, with exactly `{ version: 3 }`. The browser then
   received a synthetic 502 in place of the successful mutation response,
   proving that it made one detail read, displayed refreshed version 5, and did
   not retry the mutation.
5. A `sending` row rendered as stuck and needs investigation, with duplicate
   email risk explained and zero action buttons.
6. An external approval made the browser's version stale; the browser then
   received 409, made no second mutation request, fetched the detail once, and
   rendered the refreshed `approved` version 2 plus the live warning. A
   competing approved fixture proves the updated row is re-sorted newest-first
   rather than left at its former position.
7. A signed-in identity outside the operator allowlist received 403, saw a
   clear non-leaking message, and left the draft at version 1 in `draft` state.

## Accessibility And Responsive Evidence

`@axe-core/playwright` runs against the populated queue at both target widths:

- 1280 px: serious/critical violations `0`;
- 375 px: serious/critical violations `0`;
- combined asserted serious/critical violations: `0`.

Both viewports assert no document-level horizontal overflow. The passing HTML
report contains explicit full-page wide and narrow screenshots plus JSON axe
attachments. Failure traces and screenshots are retained for diagnosis, with
test-source embedding disabled on traces to keep fixture internals out of
artifacts.

Zero serious/critical axe findings are an automated baseline, not a complete
WCAG conformance claim or a substitute for a manual screen-reader review.

## Local And CI Execution Topology

On a normal machine and in GitHub Actions, `test/browser/run.mjs`:

1. removes only `test/.tmp` browser state and artifacts;
2. applies all migrations to the dedicated browser-test D1 using `--local` and
   the same `--persist-to` path used by the server;
3. executes the synthetic seed SQL;
4. starts `wrangler dev --local` with `HONOWARDEN_INQUIRY_ENV=development`;
5. drives it with Playwright Chromium.

This matches Cloudflare's documented local D1 persistence model and local Email
binding simulation. The Email binding is not remote, so it logs/simulates the
send rather than delivering a real message. See the Cloudflare documentation
for [local D1 data](https://developers.cloudflare.com/workers/local-development/local-data/)
and [local Email sending](https://developers.cloudflare.com/email-service/local-development/sending/).

The managed verification sandbox used for this evidence prohibits loopback
listen and the normal multi-process Chromium rendezvous. The runner detects
that condition rather than silently skipping. For this local run only, it used
the committed socketless path: Playwright routed browser HTTP requests directly
to the actual Worker `fetch()` handler, while a SQLite-backed D1-compatible
binding applied the same migrations and seed. Mutation, authorization, queue,
and UI code were not mocked. A single-process Chromium launch was scoped only
to that fallback. The registry was also unavailable, so the local axe run used
cached `axe-core` 4.11.1 through an ignored compatibility loader matching the
committed `AxeBuilder` call. CI installs and runs the declared official
`@axe-core/playwright` package.

The fallback is explicit in command output and is local-only. CI sets
`HON120_REQUIRE_WRANGLER=1`; GitHub Actions or any CI process also activates the
same guard automatically. If loopback is unavailable there, the suite fails
loudly instead of switching to the compatibility bridge. A green CI browser
gate therefore proves the primary Wrangler/local-D1 path ran.

## CI And Artifacts

The existing CI gates remain unconditional. CI additionally runs:

- `pnpm exec playwright install --with-deps chromium`;
- `pnpm test:browser`.

There is no browser-test skip path. The HTML report and result directory are
uploaded for seven days even when the browser test fails, without making a
missing diagnostic artifact hide a test failure. Generated state and artifacts
live under ignored `test/.tmp/` paths. The browser step explicitly requires
Wrangler so a runner limitation cannot silently downgrade test fidelity.

## Limitations And Residual Risks

- Local Worker authentication proves the defense-in-depth gate, not the
  separately configured Cloudflare Access edge application or deployed custom
  domains.
- Local Email simulation and the socketless synthetic sender prove state
  transitions, CAS behavior, and UI handling, not real provider delivery.
- The retryable failure is seeded because successful local transport cannot
  manufacture a provider structural failure code safely.
- CI/browser evidence is Chromium-only; it is not cross-browser evidence.
- The local managed-sandbox run used the explicit socketless compatibility
  path described above. The primary Wrangler/local-D1 path is configured and
  dry-run validated but must be read back from CI after the commit is pushed.
- Queue pagination is a live keyset view, not a historical snapshot. Concurrent
  updates can move rows relative to a cursor, while version checks continue to
  protect mutations.
- No staging or production deployment, live Access login, real outbound email,
  or production D1 migration was performed in this slice.
