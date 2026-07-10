import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import type { InquiryBindings } from "./bindings";

export const verifiedOperatorHeader = "X-HonoWarden-Verified-Operator";

type AccessAuthResult =
  | { ok: true; operator: string }
  | {
      ok: false;
      error:
        | "access_not_configured"
        | "access_token_invalid"
        | "access_token_required"
        | "operator_identity_required";
      status: 401 | 503;
    };

const remoteJwksByTeamDomain = new Map<string, JWTVerifyGetKey>();

export async function authenticateInquiryAccess(
  request: Request,
  env: InquiryBindings,
  verificationKey?: JWTVerifyGetKey,
): Promise<AccessAuthResult> {
  if (!requiresVerifiedAccess(env)) {
    const operator = normalizeEmail(
      request.headers.get("Cf-Access-Authenticated-User-Email") ??
        request.headers.get("X-HonoWarden-Operator"),
    );
    return operator
      ? { ok: true, operator }
      : { ok: false, error: "operator_identity_required", status: 401 };
  }

  const teamDomain = normalizeTeamDomain(env.HONOWARDEN_ACCESS_TEAM_DOMAIN);
  const audience = requiredString(env.HONOWARDEN_ACCESS_AUD);
  if (!teamDomain || !audience) {
    return { ok: false, error: "access_not_configured", status: 503 };
  }

  const token = requiredString(request.headers.get("Cf-Access-Jwt-Assertion"));
  if (!token) {
    return { ok: false, error: "access_token_required", status: 401 };
  }

  try {
    const { payload } = await jwtVerify(
      token,
      verificationKey ?? remoteJwks(teamDomain),
      {
        algorithms: ["RS256"],
        audience,
        issuer: teamDomain,
      },
    );
    const operator = normalizeEmail(payload.email);
    if (!operator) {
      return { ok: false, error: "access_token_invalid", status: 401 };
    }

    return { ok: true, operator };
  } catch {
    return { ok: false, error: "access_token_invalid", status: 401 };
  }
}

export function withVerifiedOperator(
  request: Request,
  operator: string,
): Request {
  const headers = new Headers(request.headers);
  headers.delete(verifiedOperatorHeader);
  headers.delete("Cf-Access-Authenticated-User-Email");
  headers.set(verifiedOperatorHeader, operator);
  return new Request(request, { headers });
}

function requiresVerifiedAccess(env: InquiryBindings): boolean {
  return (
    env.HONOWARDEN_INQUIRY_ENV !== undefined &&
    env.HONOWARDEN_INQUIRY_ENV !== "development"
  );
}

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  const existing = remoteJwksByTeamDomain.get(teamDomain);
  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(
    new URL("/cdn-cgi/access/certs", `${teamDomain}/`),
    {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    },
  );
  remoteJwksByTeamDomain.set(teamDomain, jwks);
  return jwks;
}

function normalizeTeamDomain(value: unknown): string | null {
  const text = requiredString(value);
  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".cloudflareaccess.com") ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown): string | null {
  const text = requiredString(value)?.toLowerCase();
  return text?.includes("@") ? text : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
