import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = 8790;
const directBridge = process.env.HON120_DIRECT_BRIDGE === "1";
const baseURL = directBridge
  ? "http://honowarden.local"
  : `http://${host}:${port}`;
const localWorkerServer = directBridge
  ? {}
  : {
      webServer: {
        command: [
          "wrangler dev",
          "--config test/browser/wrangler.jsonc",
          "--local",
          "--persist-to test/.tmp/browser-state",
          `--ip ${host}`,
          `--port ${port}`,
          "--log-level warn",
          "--show-interactive-dev-session=false",
        ].join(" "),
        env: {
          ...process.env,
          CI: "1",
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_WRITE_LOGS: "false",
        },
        url: `${baseURL}/operator`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
    };
const socketlessBrowserLaunch = directBridge
  ? {
      launchOptions: {
        args: ["--single-process", "--no-zygote"],
      },
    }
  : {};

export default defineConfig({
  ...localWorkerServer,
  testDir: "./test/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  outputDir: "test/.tmp/playwright-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test/.tmp/playwright-report" }],
  ],
  use: {
    baseURL,
    extraHTTPHeaders: {
      "X-HonoWarden-Operator": "browser-operator@example.test",
    },
    screenshot: "only-on-failure",
    trace: { mode: "retain-on-failure", sources: false },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...socketlessBrowserLaunch,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
