import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { Page } from "@playwright/test";

import worker from "../../../src/index";
import type { InquiryBindings } from "../../../src/bindings";

export const directBridgeEnabled = process.env.HON120_DIRECT_BRIDGE === "1";
export const browserBaseURL = directBridgeEnabled
  ? "http://honowarden.local"
  : "http://127.0.0.1:8790";

const operatorHeader = "X-HonoWarden-Operator";
const authorizedOperator = "browser-operator@example.test";
const resendEndpoint = "https://api.resend.com/emails";
const bridgedPages = new WeakSet<Page>();
let database: DatabaseSync | null = null;
let bindings: InquiryBindings | null = null;
let originalFetch: typeof globalThis.fetch | null = null;

export function initializeDirectWorker(): void {
  if (!directBridgeEnabled || database) {
    return;
  }

  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  const migrationDirectory = resolve(process.cwd(), "migrations");
  for (const file of readdirSync(migrationDirectory).sort()) {
    if (file.endsWith(".sql")) {
      database.exec(readFileSync(resolve(migrationDirectory, file), "utf8"));
    }
  }
  database.exec(
    readFileSync(resolve(process.cwd(), "test/browser/seed.sql"), "utf8"),
  );

  originalFetch = globalThis.fetch;
  const passthroughFetch = originalFetch;
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
    return passthroughFetch(input, init);
  };

  bindings = {
    INQUIRY_DB: new SqliteD1Database(database) as unknown as D1Database,
    HONOWARDEN_RESEND_API_KEY: "re_synthetic_browser",
    HONOWARDEN_INQUIRY_ENV: "development",
    HONOWARDEN_INQUIRY_OPERATORS: authorizedOperator,
  };
}

export function disposeDirectWorker(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  database?.close();
  database = null;
  bindings = null;
}

export async function bridgeWorkerRequests(page: Page): Promise<void> {
  if (!directBridgeEnabled || bridgedPages.has(page)) {
    return;
  }
  const workerBindings = requiredBindings();
  await page.route(`${browserBaseURL}/**`, async (route) => {
    const browserRequest = route.request();
    const method = browserRequest.method();
    const headers = new Headers(await browserRequest.allHeaders());
    headers.delete("content-length");
    const init: RequestInit = { headers, method };
    const body = browserRequest.postData();
    if (body !== null && method !== "GET" && method !== "HEAD") {
      init.body = body;
    }

    const response = await worker.fetch(
      new Request(browserRequest.url(), init),
      workerBindings,
    );
    await route.fulfill({
      body: Buffer.from(await response.arrayBuffer()),
      headers: Object.fromEntries(response.headers),
      status: response.status,
    });
  });
  bridgedPages.add(page);
}

export async function requestWorker(
  path: string,
  options: {
    method?: string;
    json?: unknown;
    operator?: string;
  } = {},
): Promise<Response> {
  const headers = new Headers({
    Accept: "application/json",
    [operatorHeader]: options.operator ?? authorizedOperator,
  });
  const init: RequestInit = {
    headers,
    method: options.method ?? "GET",
  };
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.json);
  }
  const request = new Request(new URL(path, browserBaseURL), init);

  if (directBridgeEnabled) {
    return worker.fetch(request, requiredBindings());
  }
  return fetch(request);
}

function requiredBindings(): InquiryBindings {
  if (!bindings) {
    throw new Error("The socketless browser bridge was not initialized.");
  }
  return bindings;
}

class SqliteD1Database {
  constructor(private readonly database: DatabaseSync) {}

  prepare(query: string): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this.database, query, []);
  }
}

class SqliteD1PreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
    private readonly bindings: SQLInputValue[],
  ) {}

  bind(...values: unknown[]): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(
      this.database,
      this.query,
      values as SQLInputValue[],
    );
  }

  first<T>(): Promise<T | null> {
    const row = this.database.prepare(this.query).get(...this.bindings);
    return Promise.resolve((row as T | undefined) ?? null);
  }

  all<T>(): Promise<{ results: T[]; success: true }> {
    const rows = this.database.prepare(this.query).all(...this.bindings);
    return Promise.resolve({ results: rows as T[], success: true });
  }

  run(): Promise<{ meta: { changes: number }; success: true }> {
    const result = this.database.prepare(this.query).run(...this.bindings);
    return Promise.resolve({
      meta: { changes: Number(result.changes) },
      success: true,
    });
  }
}
