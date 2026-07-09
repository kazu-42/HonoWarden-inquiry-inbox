import type { InquiryBindings } from "./bindings";
import { handleInquiryEmail } from "./inquiry-mail";
import type { InquiryEmailMessage } from "./inquiry-mail";

const serviceName = "honowarden-inquiry-inbox";

export default {
  fetch(_request: Request, env: InquiryBindings): Response {
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
