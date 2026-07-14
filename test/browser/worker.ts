import worker from "../../src/index";
import type { InquiryBindings } from "../../src/bindings";

const resendEndpoint = "https://api.resend.com/emails";
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url === resendEndpoint) {
    return Response.json(
      { id: "synthetic-browser-provider-id" },
      { status: 200 },
    );
  }
  return originalFetch(input, init);
};

export default {
  fetch(request: Request, env: InquiryBindings): Promise<Response> {
    return worker.fetch(request, {
      ...env,
      HONOWARDEN_RESEND_API_KEY: "re_synthetic_browser",
    });
  },
} satisfies ExportedHandler<InquiryBindings>;
