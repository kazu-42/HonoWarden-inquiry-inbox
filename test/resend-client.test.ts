import { afterEach, describe, expect, it, vi } from "vitest";

import { sendViaResend } from "../src/resend-client";

const message = {
  to: "reporter@example.test",
  from: "support@honowarden.com",
  replyTo: "support+thread_1@honowarden.com",
  subject: "Re: Support",
  text: "approved reply body",
  headers: {
    "X-HonoWarden-Inquiry-Thread": "thread_1",
    "X-HonoWarden-Inquiry-Draft": "draft_1",
  },
};

describe("Resend client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the outbound message and returns the provider message ID", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ id: "provider-message-id" }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendViaResend("re_test_synthetic", message);

    expect(result).toEqual({ ok: true, messageId: "provider-message-id" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer re_test_synthetic",
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(String(init.body))).toEqual({
      from: message.from,
      to: [message.to],
      reply_to: message.replyTo,
      subject: message.subject,
      text: message.text,
      headers: message.headers,
    });
  });

  it("accepts a successful response without a usable message ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );

    await expect(sendViaResend("re_test_synthetic", message)).resolves.toEqual({
      ok: true,
      messageId: null,
    });
  });

  it.each([
    [429, "E_PROVIDER_RATE_LIMITED"],
    [500, "E_PROVIDER_UNAVAILABLE"],
    [599, "E_PROVIDER_UNAVAILABLE"],
    [401, "E_SENDER_DOMAIN_NOT_AVAILABLE"],
    [403, "E_SENDER_DOMAIN_NOT_AVAILABLE"],
    [422, "E_EMAIL_REQUEST_INVALID"],
    [400, "email_send_failed"],
  ] as const)(
    "maps HTTP %i to %s without reading the provider body",
    async (status, code) => {
      const providerResponse = new Response(
        JSON.stringify({
          message:
            "E_fake reporter@example.test raw-provider-error must stay unread",
        }),
        { status },
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => providerResponse),
      );

      const result = await sendViaResend("re_test_synthetic", message);

      expect(result).toEqual({ ok: false, code });
      expect(providerResponse.bodyUsed).toBe(false);
    },
  );

  it("maps network failures to a retryable structural code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(
          "network error with reporter@example.test and re_test_synthetic",
        );
      }),
    );

    await expect(sendViaResend("re_test_synthetic", message)).resolves.toEqual({
      ok: false,
      code: "E_PROVIDER_UNAVAILABLE",
    });
  });
});
