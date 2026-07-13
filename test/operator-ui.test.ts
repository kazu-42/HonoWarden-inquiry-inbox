import { describe, expect, it } from "vitest";

import type { InquiryBindings } from "../src/bindings";
import worker from "../src/index";
import { RecordingD1Database } from "./support/fakes";

const operatorUrl = "https://inbox.example.test/operator";

describe("operator queue browser surface", () => {
  it("rejects an unauthenticated production request in Worker code", async () => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      new Request(operatorUrl, {
        headers: {
          "Cf-Access-Authenticated-User-Email": "spoofed@example.test",
        },
      }),
      bindings(database, {
        HONOWARDEN_INQUIRY_ENV: "production",
        HONOWARDEN_ACCESS_TEAM_DOMAIN:
          "https://honowarden-test.cloudflareaccess.com",
        HONOWARDEN_ACCESS_AUD: "operator-queue-audience",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "access_token_required",
    });
    expect(database.queries).toEqual([]);
  });

  it("still requires an operator identity in development", async () => {
    const database = new RecordingD1Database();

    const response = await worker.fetch(
      new Request(operatorUrl),
      bindings(database),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "operator_identity_required",
    });
    expect(database.queries).toEqual([]);
  });

  it("serves a self-contained, non-cacheable semantic HTML document", async () => {
    const response = await worker.fetch(
      operatorRequest(),
      bindings(new RecordingD1Database()),
    );
    const html = await response.text();
    const contentSecurityPolicy = response.headers.get(
      "Content-Security-Policy",
    );
    const nonce = contentSecurityPolicy?.match(
      /script-src 'nonce-([^']+)'/,
    )?.[1];

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(
      /^text\/html;\s*charset=utf-8$/i,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(contentSecurityPolicy).toContain("connect-src 'self'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(nonce).toMatch(/^[A-Za-z0-9+/=_-]+$/);
    expect(html).toContain(`<style nonce="${nonce}">`);
    expect(html).toContain(`<script nonce="${nonce}">`);

    expect(html).toMatch(/<html\s+lang="en"/);
    expect(html).toMatch(/<header[\s>]/);
    expect(html).toMatch(/<main[\s>]/);
    expect(html).toMatch(/<fieldset[\s>]/);
    expect(html).toMatch(/<ul[^>]+id="queue-list"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("/api/drafts");
    expect(html).toContain("Retrying could duplicate an email");

    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(html).not.toContain("spoofed@example.test");
    expect(html).not.toContain("private body marker");
    expect(html).not.toContain("raw provider text marker");
  });

  it("does not fall through to service metadata for an unsupported UI method", async () => {
    const response = await worker.fetch(
      operatorRequest("POST"),
      bindings(new RecordingD1Database()),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    await expect(response.json()).resolves.toEqual({
      error: "method_not_allowed",
    });
  });
});

function operatorRequest(method = "GET"): Request {
  return new Request(operatorUrl, {
    method,
    headers: {
      "X-HonoWarden-Operator": "operator@example.test",
    },
  });
}

function bindings(
  database: RecordingD1Database,
  overrides: Partial<InquiryBindings> = {},
): InquiryBindings {
  return {
    INQUIRY_DB: database as unknown as D1Database,
    ...overrides,
  };
}
