import { describe, expect, it } from "vitest";

import { resolveEmailErrorCode } from "../src/email-errors";

describe("structural email error codes", () => {
  it("preserves a whitelisted provider code", () => {
    expect(
      resolveEmailErrorCode(
        { code: "E_PROVIDER_UNAVAILABLE" },
        "E_EMAIL_FORWARD_FAILED",
      ),
    ).toBe("E_PROVIDER_UNAVAILABLE");
  });

  it("uses the inbound structural fallback without exposing provider details", () => {
    expect(
      resolveEmailErrorCode(
        {
          code: "provider leaked private-forward@example.test",
          message: "private subject and body",
        },
        "E_EMAIL_FORWARD_FAILED",
      ),
    ).toBe("E_EMAIL_FORWARD_FAILED");
  });

  it("preserves the existing outbound fallback", () => {
    expect(
      resolveEmailErrorCode(
        new Error("provider unavailable"),
        "email_send_failed",
      ),
    ).toBe("email_send_failed");
  });
});
