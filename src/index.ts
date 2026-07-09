import type { InquiryBindings } from "./bindings";
import { handleInquiryEmail } from "./inquiry-mail";
import type { InquiryEmailMessage } from "./inquiry-mail";
import { handleInquiryHttpRequest } from "./outbound-replies";

const serviceName = "honowarden-inquiry-inbox";

export default {
  async fetch(request: Request, env: InquiryBindings): Promise<Response> {
    const apiResponse = await handleInquiryHttpRequest(request, env);
    if (apiResponse) {
      return apiResponse;
    }

    return Response.json({
      service: serviceName,
      status: "ok",
      environment: env.HONOWARDEN_INQUIRY_ENV ?? "development",
    });
  },

  async email(
    message: ForwardableEmailMessage,
    env: InquiryBindings,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await handleInquiryEmail(message as unknown as InquiryEmailMessage, env);
  },
} satisfies ExportedHandler<InquiryBindings>;
