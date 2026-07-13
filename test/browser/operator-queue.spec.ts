import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  bridgeWorkerRequests,
  disposeDirectWorker,
  initializeDirectWorker,
  requestWorker,
} from "./support/direct-worker";

test.beforeAll(() => initializeDirectWorker());
test.afterAll(() => disposeDirectWorker());

test("covers the accessible operator queue and its guarded workflows", async ({
  page,
}, testInfo) => {
  await test.step("renders the redacted paginated queue at wide and narrow viewports", async () => {
    await openQueue(page);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Operator queue",
    );
    await expect(page.locator("article.draft-card")).toHaveCount(25);
    await expect(page.locator('[data-status="draft"] h3').first()).toHaveText(
      "Pending fixture: approve then send",
    );
    await expect(
      page.getByText("Recipient hash aaaaaaaaaaaa…aaaa"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Linear issue DEMO-120" }),
    ).toHaveAttribute(
      "href",
      "https://linear.app/example/issue/DEMO-120/synthetic-browser-fixture",
    );

    const pageText = await page.locator("body").innerText();
    expect(pageText).not.toMatch(/fixture-recipient\s*@/i);
    expect(pageText).not.toMatch(/browser-sender\s*@/i);

    const queueResponse = await requestWorker(
      "/api/drafts?status=draft&status=approved&status=send_failed&status=sending&limit=25",
    );
    expect(queueResponse.ok).toBe(true);
    const queueJson = await queueResponse.text();
    expect(queueJson).not.toMatch(/fixture-recipient\s*@/i);
    expect(queueJson).not.toMatch(
      /"(?:toAddress|textBody|body|rawProviderText)"\s*:/,
    );

    const refreshButton = page.getByRole("button", { name: "Refresh queue" });
    await refreshButton.focus();
    await expect(refreshButton).toBeFocused();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/drafts",
      ),
      refreshButton.press("Enter"),
    ]);
    await expect(page.locator("#queue-region")).toHaveAttribute(
      "aria-busy",
      "false",
    );

    await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/drafts?") &&
          response.url().includes("cursor="),
      ),
      page.getByRole("button", { name: "Load more" }).click(),
    ]);
    await expect(page.locator("article.draft-card")).toHaveCount(28);
    await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, testInfo, "wide-1280");
    await testInfo.attach("operator-queue-wide-1280", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole("button", { name: "Refresh queue" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, testInfo, "narrow-375");
    await testInfo.attach("operator-queue-narrow-375", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  await test.step("moves a pending draft through approve and send to sent", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const requests: Array<{ action: string; body: unknown }> = [];
    page.on("request", (request) => {
      const match = new URL(request.url()).pathname.match(
        /^\/api\/drafts\/draft_flow\/(approve|send)$/,
      );
      if (request.method() === "POST" && match?.[1]) {
        requests.push({ action: match[1], body: request.postDataJSON() });
      }
    });

    await openQueue(page);
    const card = page.locator('article[data-draft-id="draft_flow"]');
    await expect(card).toContainText("Version 1");

    const approvalResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/drafts/draft_flow/approve",
    );
    await card.getByRole("button", { name: /^Approve draft:/ }).click();
    expect((await approvalResponse).status()).toBe(200);
    await expect(
      page.locator('article[data-draft-id="draft_flow"]'),
    ).toContainText("Version 2");
    await expect(
      page.locator('article[data-draft-id="draft_flow"]'),
    ).toContainText("Approved");
    const sendButton = page
      .locator('article[data-draft-id="draft_flow"]')
      .getByRole("button", { name: /^Send email draft:/ });
    await expect(sendButton).toBeFocused();

    const sendResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/drafts/draft_flow/send",
    );
    await sendButton.click();
    expect((await sendResponse).status()).toBe(200);
    const sendMessage = page.locator("#operator-message");
    await expect(sendMessage).toContainText(
      "Send completed. The draft is now sent.",
    );
    await expect(sendMessage).toBeFocused();

    expect(requests).toEqual([
      { action: "approve", body: { version: 1 } },
      { action: "send", body: { version: 2 } },
    ]);

    await selectStatus(page, "Sent");
    const sentCard = page.locator('article[data-draft-id="draft_flow"]');
    await expect(sentCard).toContainText("Sent");
    await expect(sentCard).toContainText("Version 4");
    await expect(sentCard.getByRole("button")).toHaveCount(0);
  });

  await test.step("retries an eligible failure and refreshes an uncertain response", async () => {
    await openQueue(page);
    const failedCard = page.locator('article[data-draft-id="retry_flow"]');
    await expect(failedCard).toContainText("Retry eligible: yes");
    await expect(failedCard).toContainText("E_PROVIDER_UNAVAILABLE");
    await expect(failedCard).toContainText("Version 3");

    let requestBody: unknown;
    let uiRetryCount = 0;
    await page.route("**/api/drafts/retry_flow/retry", async (route) => {
      uiRetryCount += 1;
      requestBody = route.request().postDataJSON();
      const workerResponse = await requestWorker(
        "/api/drafts/retry_flow/retry",
        { method: "POST", json: requestBody },
      );
      expect(workerResponse.status).toBe(200);
      await route.fulfill({
        body: JSON.stringify({ error: "email_send_failed" }),
        contentType: "application/json",
        status: 502,
      });
    });

    const retryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/drafts/retry_flow/retry",
    );
    const detailRefresh = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/drafts/retry_flow",
    );
    await failedCard
      .getByRole("button", { name: /^Retry send draft:/ })
      .click();
    expect((await retryResponse).status()).toBe(502);
    expect((await detailRefresh).status()).toBe(200);
    expect(requestBody).toEqual({ version: 3 });
    expect(uiRetryCount).toBe(1);
    const retryMessage = page.locator("#operator-message");
    await expect(retryMessage).toContainText(
      "Its final state was uncertain, so no automatic retry was attempted.",
    );
    await expect(retryMessage).toContainText(
      "The row was refreshed and is now sent at version 5.",
    );
    await expect(retryMessage).toBeFocused();

    await selectStatus(page, "Sent");
    const sentCard = page.locator('article[data-draft-id="retry_flow"]');
    await expect(sentCard).toContainText("Sent");
    await expect(sentCard).toContainText("Version 5");
    await expect(sentCard.getByRole("button")).toHaveCount(0);
  });

  await test.step("withholds stuck retry and surfaces a stale-version conflict", async () => {
    await openQueue(page);

    const stuckCard = page.locator('article[data-draft-id="stuck_flow"]');
    await expect(stuckCard).toContainText("Stuck: yes");
    await expect(stuckCard).toContainText("Needs investigation");
    await expect(stuckCard).toContainText("Retrying could duplicate an email");
    await expect(stuckCard.getByRole("button")).toHaveCount(0);

    const staleCard = page.locator('article[data-draft-id="stale_flow"]');
    await expect(staleCard).toContainText("Version 1");

    let staleUiPostCount = 0;
    await page.route("**/api/drafts/stale_flow/approve", async (route) => {
      staleUiPostCount += 1;
      await route.fallback();
    });

    const externalApproval = await requestWorker(
      "/api/drafts/stale_flow/approve",
      { method: "POST", json: { version: 1 } },
    );
    expect(externalApproval.status).toBe(200);

    const conflictResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/drafts/stale_flow/approve",
    );
    await staleCard.getByRole("button", { name: /^Approve draft:/ }).click();
    expect((await conflictResponse).status()).toBe(409);

    const warning = page.locator("#operator-message");
    await expect(warning).toContainText("changed underneath you");
    await expect(warning).toContainText("The action was not retried");
    await expect(
      page.locator('article[data-draft-id="stale_flow"]'),
    ).toContainText("Approved");
    await expect(
      page.locator('article[data-draft-id="stale_flow"]'),
    ).toContainText("Version 2");
    await expect(
      page.locator('[data-status="approved"] h3').first(),
    ).toHaveText("Stale fixture: surface the conflict");
    await expect(page.locator('[data-status="approved"] h3').nth(1)).toHaveText(
      "Approved fixture: ordering anchor",
    );
    await expect(
      page
        .locator('article[data-draft-id="stale_flow"]')
        .getByRole("button", { name: /^Send email draft:/ }),
    ).toBeFocused();
    expect(staleUiPostCount).toBe(1);
  });

  await test.step("shows a non-leaking 403 message for a signed-in non-operator", async () => {
    await page.setExtraHTTPHeaders({
      "X-HonoWarden-Operator": "signed-in-viewer@example.test",
    });
    await openQueue(page);
    const card = page.locator('article[data-draft-id="unauthorized_flow"]');
    await expect(card).toContainText("Version 1");

    const deniedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/api/drafts/unauthorized_flow/approve",
    );
    await card.getByRole("button", { name: /^Approve draft:/ }).click();
    expect((await deniedResponse).status()).toBe(403);

    const message = page.locator("#operator-message");
    await expect(message).toContainText(
      "signed in, but this account is not authorized to operate drafts",
    );
    await expect(message).toContainText("No message data was changed");
    expect(await page.locator("body").innerText()).not.toMatch(
      /fixture-recipient\s*@/i,
    );
    await expect(
      page
        .locator('article[data-draft-id="unauthorized_flow"]')
        .getByRole("button", { name: /^Approve draft:/ }),
    ).toBeFocused();

    const detail = await requestWorker("/api/drafts/unauthorized_flow", {
      operator: "signed-in-viewer@example.test",
    });
    expect(detail.ok).toBe(true);
    expect(((await detail.json()) as { draft: unknown }).draft).toMatchObject({
      status: "draft",
      version: 1,
    });
  });
});

async function openQueue(page: Page): Promise<void> {
  await bridgeWorkerRequests(page);
  await page.goto("/operator");
  await expect(page.locator("#queue-region")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator("article.draft-card").first()).toBeVisible();
}

async function selectStatus(page: Page, label: string): Promise<void> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "GET" &&
      new URL(candidate.url()).pathname === "/api/drafts",
  );
  await page.getByLabel(label, { exact: true }).check();
  expect((await response).status()).toBe(200);
  await expect(page.locator("#queue-region")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => {
      const browserGlobal = globalThis as unknown as {
        document: {
          documentElement: { clientWidth: number; scrollWidth: number };
        };
      };
      const root = browserGlobal.document.documentElement;
      return root.scrollWidth <= root.clientWidth;
    }),
  ).toBe(true);
}

async function expectNoSeriousA11yViolations(
  page: Page,
  testInfo: TestInfo,
  viewport: string,
): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  console.log(
    `[a11y:${viewport}] serious/critical violations: ${seriousOrCritical.length}`,
  );
  await testInfo.attach(`axe-${viewport}`, {
    body: Buffer.from(
      JSON.stringify(
        {
          seriousOrCriticalCount: seriousOrCritical.length,
          violations: seriousOrCritical,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
  expect(seriousOrCritical).toEqual([]);
}
