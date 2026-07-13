export const fakeMeta = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 1,
  last_row_id: 1,
  changed_db: true,
  changes: 1,
} satisfies D1Meta & Record<string, unknown>;

export type RecordedD1Run = {
  query: string;
  boundValues: readonly unknown[];
  changes: number;
};

export class RecordingD1Database {
  readonly queries: string[] = [];
  readonly boundValues: unknown[] = [];
  readonly completedRuns: RecordedD1Run[] = [];
  private readonly runChanges: number[];

  constructor(
    private readonly firstResult: unknown | null = null,
    private readonly allResults: readonly unknown[] = [],
    runChanges: readonly number[] = [],
  ) {
    this.runChanges = [...runChanges];
  }

  prepare(query: string): D1PreparedStatement {
    this.queries.push(query);
    const recordedBoundValues = this.boundValues;
    const completedRuns = this.completedRuns;
    const firstResult = this.firstResult;
    const allResults = this.allResults;
    const runChanges = this.runChanges;
    const statementBoundValues: unknown[] = [];

    const statement = {
      bind(...boundValues: unknown[]) {
        recordedBoundValues.push(...boundValues);
        statementBoundValues.push(...boundValues);
        return statement as unknown as D1PreparedStatement;
      },
      async run(): Promise<D1Result> {
        const changes = runChanges.shift() ?? fakeMeta.changes;
        completedRuns.push({
          query,
          boundValues: [...statementBoundValues],
          changes,
        });
        return {
          success: true,
          results: [],
          meta: {
            ...fakeMeta,
            rows_written: changes,
            changed_db: changes > 0,
            changes,
          },
        };
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        return {
          success: true,
          results: [...allResults] as T[],
          meta: fakeMeta,
        };
      },
      async first<T = unknown>(): Promise<T | null> {
        return firstResult as T | null;
      },
      async raw<T = unknown[]>(): Promise<T[]> {
        return [] as T[];
      },
    };

    return statement as unknown as D1PreparedStatement;
  }
}

export class FakeEmailMessage {
  readonly headers: Headers;
  readonly raw: ReadableStream;
  rejectedReason: string | null = null;
  forwardedTo: string | null = null;

  constructor(
    readonly from: string,
    readonly to: string,
    rawMessage: string,
  ) {
    this.headers = parseRawHeaders(rawMessage);
    this.raw = new Response(rawMessage).body as ReadableStream;
  }

  setReject(reason: string): void {
    this.rejectedReason = reason;
  }

  async forward(recipient: string): Promise<void> {
    this.forwardedTo = recipient;
  }
}

function parseRawHeaders(rawMessage: string): Headers {
  const headers = new Headers();
  const [rawHeaderBlock = ""] = rawMessage.split(/\r?\n\r?\n/, 1);
  for (const line of rawHeaderBlock.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    headers.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return headers;
}

export function textEmail(
  input: {
    from?: string;
    to?: string;
    subject?: string;
    messageId?: string;
    body?: string;
  } = {},
): string {
  return [
    `From: ${input.from ?? "Reporter <reporter@example.test>"}`,
    `To: ${input.to ?? "security@honowarden.com"}`,
    `Subject: ${input.subject ?? "Security report"}`,
    `Message-ID: ${input.messageId ?? "<message-1@example.test>"}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body ?? "private body should not be stored in query bindings",
  ].join("\r\n");
}

export function attachmentEmail(): string {
  return [
    "From: Reporter <reporter@example.test>",
    "To: security@honowarden.com",
    "Subject: Attachment report",
    "Message-ID: <message-with-attachment@example.test>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="boundary-1"',
    "",
    "--boundary-1",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Please see attached.",
    "--boundary-1",
    'Content-Type: text/plain; name="secret.txt"',
    'Content-Disposition: attachment; filename="secret.txt"',
    "",
    "attachment body",
    "--boundary-1--",
  ].join("\r\n");
}
