import { rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import console from "node:console";
import { createServer } from "node:net";
import process from "node:process";

const generatedPaths = [
  "test/.tmp/browser-state",
  "test/.tmp/playwright-report",
  "test/.tmp/playwright-results",
];

for (const path of generatedPaths) {
  rmSync(path, { force: true, recursive: true });
}
mkdirSync("test/.tmp/browser-state", { recursive: true });

const environment = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
};
delete environment.HON120_DIRECT_BRIDGE;

if (await canListenOnLoopback()) {
  run("wrangler", [
    "d1",
    "migrations",
    "apply",
    "INQUIRY_DB",
    "--config",
    "test/browser/wrangler.jsonc",
    "--local",
    "--persist-to",
    "test/.tmp/browser-state",
  ]);

  run("wrangler", [
    "d1",
    "execute",
    "INQUIRY_DB",
    "--config",
    "test/browser/wrangler.jsonc",
    "--local",
    "--persist-to",
    "test/.tmp/browser-state",
    "--file",
    "test/browser/seed.sql",
    "--yes",
  ]);
} else {
  if (wranglerIsRequired()) {
    console.error(
      "Loopback listen is unavailable; Wrangler and local D1 are required in CI.",
    );
    process.exit(1);
  }
  environment.HON120_DIRECT_BRIDGE = "1";
  console.warn(
    "Loopback listen is unavailable; using the socketless Worker/D1 browser bridge.",
  );
}

const result = spawnSync(
  "playwright",
  ["test", "--config=playwright.config.ts"],
  {
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function canListenOnLoopback() {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(0, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function wranglerIsRequired() {
  const ci = (process.env.CI ?? "").toLowerCase();
  return (
    process.env.HON120_REQUIRE_WRANGLER === "1" ||
    process.env.GITHUB_ACTIONS === "true" ||
    ci === "1" ||
    ci === "true"
  );
}
