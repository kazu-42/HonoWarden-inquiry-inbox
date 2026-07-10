import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authenticateInquiryAccess,
  verifiedOperatorHeader,
  withVerifiedOperator,
} from "../src/access-auth";
import type { InquiryBindings } from "../src/bindings";

const issuer = "https://honowarden-test.cloudflareaccess.com";
const audience = "access-audience";
let privateKey: CryptoKey;
let alternatePrivateKey: CryptoKey;
let localJwks: JWTVerifyGetKey;

beforeAll(async () => {
  const primary = await generateKeyPair("RS256", { extractable: true });
  const alternate = await generateKeyPair("RS256", { extractable: true });
  privateKey = primary.privateKey;
  alternatePrivateKey = alternate.privateKey;
  localJwks = createLocalJWKSet({
    keys: [
      {
        ...(await exportJWK(primary.publicKey)),
        alg: "RS256",
        kid: "primary",
        use: "sig",
      },
    ],
  });
});

describe("Cloudflare Access authentication", () => {
  it("accepts a valid JWT and derives operator identity from its verified claim", async () => {
    const token = await accessToken();
    const request = new Request("https://inbox.example.test/api/drafts", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "spoofed@example.test",
        "Cf-Access-Jwt-Assertion": token,
      },
    });

    const result = await authenticateInquiryAccess(
      request,
      productionBindings(),
      localJwks,
    );

    expect(result).toEqual({
      ok: true,
      operator: "verified@example.test",
    });
  });

  it("rejects missing JWTs in staging and production", async () => {
    const request = new Request("https://inbox.example.test/api/drafts", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "spoofed@example.test",
      },
    });

    const result = await authenticateInquiryAccess(
      request,
      productionBindings(),
      localJwks,
    );

    expect(result).toEqual({
      ok: false,
      error: "access_token_required",
      status: 401,
    });
  });

  it("fails closed when Access issuer or audience configuration is missing", async () => {
    const token = await accessToken();
    const request = new Request("https://inbox.example.test/api/drafts", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });

    const result = await authenticateInquiryAccess(
      request,
      {
        HONOWARDEN_INQUIRY_ENV: "production",
      } as InquiryBindings,
      localJwks,
    );

    expect(result).toEqual({
      ok: false,
      error: "access_not_configured",
      status: 503,
    });
  });

  it.each([
    ["wrong audience", () => accessToken({ audience: "wrong-audience" })],
    ["expired token", () => accessToken({ expiresAt: -1 })],
    ["bad signature", () => accessToken({ signingKey: alternatePrivateKey })],
  ])("rejects %s", async (_name, makeToken) => {
    const request = new Request("https://inbox.example.test/api/drafts", {
      headers: { "Cf-Access-Jwt-Assertion": await makeToken() },
    });

    const result = await authenticateInquiryAccess(
      request,
      productionBindings(),
      localJwks,
    );

    expect(result).toEqual({
      ok: false,
      error: "access_token_invalid",
      status: 401,
    });
  });

  it("keeps the header-only development path for local tests", async () => {
    const request = new Request("https://inbox.example.test/api/drafts", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "local@example.test",
      },
    });

    const result = await authenticateInquiryAccess(request, {
      HONOWARDEN_INQUIRY_ENV: "development",
    } as InquiryBindings);

    expect(result).toEqual({
      ok: true,
      operator: "local@example.test",
    });
  });

  it("treats unknown deployed environment names as Access-protected", async () => {
    const request = new Request("https://inbox.example.test/api/drafts", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "spoofed@example.test",
      },
    });

    const result = await authenticateInquiryAccess(
      request,
      { HONOWARDEN_INQUIRY_ENV: "prod-typo" } as InquiryBindings,
      localJwks,
    );

    expect(result).toEqual({
      ok: false,
      error: "access_not_configured",
      status: 503,
    });
  });

  it("replaces spoofable identity headers with the verified operator", () => {
    const request = new Request("https://inbox.example.test/api/drafts", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "spoofed@example.test",
        [verifiedOperatorHeader]: "attacker@example.test",
      },
    });

    const authenticated = withVerifiedOperator(
      request,
      "verified@example.test",
    );

    expect(
      authenticated.headers.get("Cf-Access-Authenticated-User-Email"),
    ).toBeNull();
    expect(authenticated.headers.get(verifiedOperatorHeader)).toBe(
      "verified@example.test",
    );
  });
});

function productionBindings(): InquiryBindings {
  return {
    HONOWARDEN_ACCESS_AUD: audience,
    HONOWARDEN_ACCESS_TEAM_DOMAIN: issuer,
    HONOWARDEN_INQUIRY_ENV: "production",
  } as InquiryBindings;
}

async function accessToken(options?: {
  audience?: string;
  expiresAt?: number;
  signingKey?: CryptoKey;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "verified@example.test" })
    .setProtectedHeader({ alg: "RS256", kid: "primary" })
    .setIssuer(issuer)
    .setAudience(options?.audience ?? audience)
    .setIssuedAt(now)
    .setExpirationTime(now + (options?.expiresAt ?? 300))
    .sign(options?.signingKey ?? privateKey);
}
