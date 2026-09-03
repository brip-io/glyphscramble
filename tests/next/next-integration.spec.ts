import { expect, test } from "@playwright/test";

const FIRST = "Sensitive analyst note alpha.";
const SECOND = "Sensitive analyst note beta.";

test("keeps plaintext out of HTML and RSC while rotating responses", async ({
  page,
  request,
}) => {
  const firstResponse = await request.get("/protected");
  expect(firstResponse.ok()).toBe(true);
  expect(firstResponse.headers()["cache-control"]).toContain("no-store");
  const firstHtml = await firstResponse.text();
  expect(firstHtml).not.toContain(FIRST);
  expect(firstHtml).not.toContain(SECOND);

  const rscResponse = await request.get("/protected?_rsc=fixture", {
    headers: { RSC: "1" },
  });
  expect(rscResponse.ok()).toBe(true);
  const rsc = await rscResponse.text();
  expect(rsc).not.toContain(FIRST);
  expect(rsc).not.toContain(SECOND);

  await page.goto("/");
  await page
    .getByRole("link", { name: "Protected example", exact: true })
    .click();
  const first = page.getByTestId("protected-first");
  const second = page.getByTestId("protected-second");
  await expect(first).toHaveAttribute("data-glyphscramble", "ready");
  await expect(second).toHaveAttribute("data-glyphscramble", "ready");
  await expect(first).not.toContainText("could not be displayed");
  const firstEncoded = await first.textContent();
  const firstFontUrl = await first.getAttribute("data-font-url");
  expect(firstEncoded).not.toBe(FIRST);
  expect(await second.textContent()).not.toBe(SECOND);
  expect(await second.getAttribute("data-font-url")).toBe(firstFontUrl);

  await page.reload();
  await expect(page.getByTestId("protected-first")).toBeVisible();
  expect(await page.getByTestId("protected-first").textContent()).not.toBe(
    firstEncoded,
  );
  expect(
    await page.getByTestId("protected-first").getAttribute("data-font-url"),
  ).not.toBe(firstFontUrl);
});

test("refreshes an expired RSC payload and serves the font GET/HEAD contract", async ({
  page,
  request,
}) => {
  const issued = await request.get("/protected");
  const issuedHtml = await issued.text();
  const issuedFontUrl = issuedHtml.match(/data-font-url="([^"]+)/)?.[1];
  expect(issuedFontUrl).toBeTruthy();
  const get = await request.get(issuedFontUrl!);
  expect(get.status()).toBe(200);
  expect(get.headers()["content-type"]).toContain("font/woff2");
  expect(get.headers()["cache-control"]).toContain("private");
  const head = await request.head(issuedFontUrl!);
  expect(head.status()).toBe(200);
  expect((await head.body()).byteLength).toBe(0);

  await page.goto("/protected");
  const block = page.getByTestId("protected-first");
  await expect(block).toBeVisible();
  await expect(block).not.toContainText("could not be displayed");
  const encoded = await block.textContent();

  await expect
    .poll(() => block.textContent(), { timeout: 15_000 })
    .not.toBe(encoded);
  await expect(block).toBeVisible();
});

test("does not impose protected caching on unrelated routes", async ({
  request,
}) => {
  const response = await request.get("/unprotected");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"] ?? "").not.toContain("no-store");
  expect(await response.text()).toContain("Cacheable public documentation");
});

test("isolates concurrent protected responses", async ({ request }) => {
  const responses = await Promise.all([
    request.get("/protected"),
    request.get("/protected"),
  ]);
  const html = await Promise.all(responses.map((response) => response.text()));
  for (const response of responses) {
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  for (const body of html) {
    expect(body).not.toContain(FIRST);
    expect(body).not.toContain(SECOND);
  }
  const urls = html.map(
    (body) => body.match(/data-font-url="([^"]+)/)?.[1] ?? "",
  );
  expect(urls[0]).toBeTruthy();
  expect(urls[1]).toBeTruthy();
  expect(urls[0]).not.toBe(urls[1]);
  await expect(
    Promise.all(urls.map(async (url) => (await request.get(url)).status())),
  ).resolves.toEqual([200, 200]);
});

test("does not remount an equivalent cloned payload", async ({ page }) => {
  await page.goto("/protected");
  const block = page.getByTestId("protected-first");
  await expect(block).toHaveAttribute("data-glyphscramble", "ready");

  await block.evaluate((element) => {
    const transitions: string[] = [];
    new MutationObserver(() => {
      transitions.push(element.getAttribute("data-glyphscramble") ?? "missing");
    }).observe(element, {
      attributes: true,
      attributeFilter: ["data-glyphscramble"],
    });
    Object.assign(window, { __glyphscrambleTransitions: transitions });
  });

  await page.getByTestId("clone-rerender").click();
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __glyphscrambleTransitions?: string[] })
          .__glyphscrambleTransitions,
    ),
  ).toEqual([]);
  await expect(block).toHaveAttribute("data-glyphscramble", "ready");
});

test("refreshes a history-restored payload after expiry", async ({ page }) => {
  await page.goto("/protected");
  const block = page.getByTestId("protected-first");
  await expect(block).toHaveAttribute("data-glyphscramble", "ready");
  const encoded = await block.textContent();

  await page.getByRole("link", { name: "Unprotected example" }).click();
  await expect(page).toHaveURL(/\/unprotected$/);
  await page.waitForTimeout(8_500);
  await page.goBack();

  const restored = page.getByTestId("protected-first");
  await expect(restored).toHaveAttribute("data-glyphscramble", "ready", {
    timeout: 10_000,
  });
  expect(await restored.textContent()).not.toBe(encoded);
});
