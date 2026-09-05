import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("publishes indexable static docs and agent-readable twins", async ({
  page,
  request,
}) => {
  const response = await page.goto("/docs/get-started/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Get started \| GlyphScramble/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://glyphscramble.brip.io/docs/get-started/",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Get started" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Static delivery/ }),
  ).toBeVisible();

  const markdown = await request.get("/docs/get-started.md");
  expect(markdown.status()).toBe(200);
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  expect(await markdown.text()).toContain("# Get started");

  const llms = await request.get("/llms.txt");
  expect(await llms.text()).toContain("Complete corpus:");
  const missing = await request.get("/definitely-not-a-page/");
  expect(missing.status()).toBe(404);
});

test("search is local, keyboard accessible, and restores focus", async ({
  page,
}) => {
  await page.goto("/docs/get-started/");
  const opener = page.getByRole("button", { name: "Search docs" });
  await opener.focus();
  await page.keyboard.press("ControlOrMeta+K");
  const input = page.getByRole("textbox", {
    name: "Search by task, framework, or API",
  });
  await expect(input).toBeFocused();
  await input.fill("static caching");
  await expect(
    page.getByRole("button", { name: /Static delivery/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  await page.keyboard.press("ControlOrMeta+K");
  await input.fill("CSP and CORS");
  await page.getByRole("button", { name: /CSP and CORS/ }).click();
  await expect(page).toHaveURL(/\/docs\/operations\/csp-cors\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "CSP and CORS" }),
  ).toBeVisible();
});

test("mobile navigation is a focus-trapped overlay without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/frameworks/react/");
  await page.getByRole("button", { name: /React/ }).click();
  const dialog = page.getByRole("dialog", { name: "Documentation" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "React", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /React/ })).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("copy controls work and the docs shell passes automated accessibility checks", async ({
  context,
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Clipboard permission is Chromium-only in this fixture.",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/reference/glyph-payload/");
  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "# GlyphPayload",
  );

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("content remains useful without JavaScript and reduced motion disables animation", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/docs/choose-content/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose content" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Apply GlyphScramble mainly to high-value blocks/),
  ).toBeVisible();
  const motion = await page.evaluate(() => ({
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    transitionSeconds: Number.parseFloat(
      getComputedStyle(document.querySelector("h1")!).transitionDuration,
    ),
  }));
  expect(motion.reduced).toBe(true);
  expect(motion.transitionSeconds).toBeLessThanOrEqual(0.00001);
  await context.close();
});

test("the documentation route has no unexpected layout shift and reflows at 320 CSS pixels", async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium exposes the buffered layout-shift API.",
  );
  await page.addInitScript(() => {
    const target = window as typeof window & { __glyphCls?: number };
    target.__glyphCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number }
      >) {
        target.__glyphCls! += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/docs/get-started/");
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => (window as typeof window & { __glyphCls?: number }).__glyphCls ?? 0,
    ),
  ).toBeLessThanOrEqual(0.01);
});

test("the static site loads no third-party resources and enforces a hash CSP", async ({
  context,
  page,
}) => {
  const origins = new Set<string>();
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const response = await page.goto("/docs/reference/configuration/");
  await page.waitForLoadState("networkidle");
  expect([...origins]).toEqual(["http://127.0.0.1:4178"]);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("sha256-");
  expect(csp).not.toContain("'unsafe-inline'");
  expect(
    errors.filter((message) => /Content Security Policy/i.test(message)),
  ).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
