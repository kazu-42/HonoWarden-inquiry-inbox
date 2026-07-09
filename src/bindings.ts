export type InquiryBindings = {
  INQUIRY_DB: D1Database;
  EMAIL?: SendEmail;
  INQUIRY_OBJECTS?: R2Bucket;
  HONOWARDEN_INQUIRY_ENV?: string;
  HONOWARDEN_INQUIRY_FORWARD_TO?: string;
  HONOWARDEN_INQUIRY_MAILBOXES?: string;
  HONOWARDEN_INQUIRY_MAX_BYTES?: string;
  HONOWARDEN_INQUIRY_RETENTION_DAYS?: string;
  HONOWARDEN_ABUSE_FORWARD_TO?: string;
  HONOWARDEN_ADMIN_FORWARD_TO?: string;
  HONOWARDEN_GENERAL_FORWARD_TO?: string;
  HONOWARDEN_HELLO_FORWARD_TO?: string;
  HONOWARDEN_POSTMASTER_FORWARD_TO?: string;
  HONOWARDEN_SECURITY_FORWARD_TO?: string;
  HONOWARDEN_SUPPORT_FORWARD_TO?: string;
};

export const defaultInquiryMailboxes = [
  "security",
  "support",
  "hello",
  "admin",
  "postmaster",
  "abuse",
] as const;
