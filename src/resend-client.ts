const resendEndpoint = "https://api.resend.com/emails";

export type ResendSendMessage = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
};

export type ResendSendResult =
  { ok: true; messageId: string | null } | { ok: false; code: string };

export async function sendViaResend(
  apiKey: string,
  message: ResendSendMessage,
): Promise<ResendSendResult> {
  let response: Response;
  try {
    response = await fetch(resendEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
        headers: message.headers,
      }),
    });
  } catch {
    return { ok: false, code: "E_PROVIDER_UNAVAILABLE" };
  }

  if (response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    return {
      ok: true,
      messageId: typeof payload?.id === "string" ? payload.id : null,
    };
  }

  return { ok: false, code: mapResendErrorStatus(response.status) };
}

function mapResendErrorStatus(status: number): string {
  if (status === 429) return "E_PROVIDER_RATE_LIMITED";
  if (status >= 500) return "E_PROVIDER_UNAVAILABLE";
  if (status === 401 || status === 403) return "E_SENDER_DOMAIN_NOT_AVAILABLE";
  if (status === 422) return "E_EMAIL_REQUEST_INVALID";
  return "email_send_failed";
}
