import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const wranglerConfig = readFileSync("wrangler.jsonc", "utf8");

describe("Wrangler AI configuration", () => {
  it("configures Workers AI for root, staging, and production", () => {
    expect(wranglerConfig.match(/"binding": "AI"/g)).toHaveLength(3);
    expect(
      wranglerConfig.match(/"HONOWARDEN_INQUIRY_AI_PROVIDER": "workers-ai"/g),
    ).toHaveLength(3);
    expect(
      wranglerConfig.match(
        /"HONOWARDEN_INQUIRY_AI_MODEL": "@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast"/g,
      ),
    ).toHaveLength(3);
  });

  it("keeps workers.dev and preview URLs disabled in every environment", () => {
    expect(wranglerConfig.match(/"workers_dev": false/g)).toHaveLength(3);
    expect(wranglerConfig.match(/"preview_urls": false/g)).toHaveLength(3);
  });
});
