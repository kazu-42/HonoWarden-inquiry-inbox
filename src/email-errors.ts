const structuralEmailErrorCodePattern = /^E_[A-Z0-9_]{1,64}$/;

export function resolveEmailErrorCode(
  error: unknown,
  fallbackCode: "email_send_failed" | "E_EMAIL_FORWARD_FAILED",
): string {
  if (!isRecord(error) || typeof error.code !== "string") {
    return fallbackCode;
  }

  return structuralEmailErrorCodePattern.test(error.code)
    ? error.code
    : fallbackCode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
