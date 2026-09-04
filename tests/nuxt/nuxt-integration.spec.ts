import { expect, test } from "@playwright/test";

const FIRST = "Sensitive analyst note alpha.";
const SECOND = "Sensitive analyst note beta.";
const STREAMED = "Delayed protected stream content.";

interface WirePayload {
  encodedText: string;
  fontUrl: string;
}

test("keeps plaintext out of HTML, payloads, and client chunks", async ({
  request,
}) => {
  const response = await request.get("/protected?source=qualified-route");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const html = await response.text();
  expect(html).not.toContain(FIRST);
  expect(html).not.toContain(SECOND);

  const scripts = [...html.matchAll(/src="([^"]*\/_nuxt\/[^" ]+\.js)"/g)].map(
    (match) => match[1]!,
  );
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    const source = await (await request.get(script)).text();
    expect(source).not.toContain(FIRST);
    expect(source).not.toContain(SECOND);
  }
});

test("renders, updates, navigates, and rotates without stale Vue mounts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Protected example", exact: true })
    .click();
  const first = page.getByTestId("protected-first");
  const second = page.getByTestId("protected-second");
  await expect(first).toHaveAttribute("data-glyphscramble", "ready");
  await expect(second).toHaveAttribute("data-glyphscramble", "ready");
  const firstEncoded = await first.textContent();
  const firstFontUrl = await first.getAttribute("data-font-url");
  expect(firstEncoded).not.toBe(FIRST);
  expect(await second.textContent()).not.toBe(SECOND);
  expect(await second.getAttribute("data-font-url")).toBe(firstFontUrl);

  await page.getByTestId("replace-payload").click();
  await expect(first).toHaveAttribute("data-glyphscramble", "ready");
  await expect.poll(() => first.textContent()).not.toBe(firstEncoded);
  await expect
    .poll(() => first.getAttribute("data-font-url"))
    .not.toBe(firstFontUrl);

  const replacementUrl = await first.getAttribute("data-font-url");
  await page.getByRole("link", { name: "Unprotected example" }).click();
  await expect(page).toHaveURL(/\/unprotected$/);
  await page.getByRole("link", { name: "Open protected content" }).click();
  const navigated = page.getByTestId("protected-first");
  await expect(navigated).toHaveAttribute("data-glyphscramble", "ready");
  expect(await navigated.getAttribute("data-font-url")).not.toBe(
    replacementUrl,
  );
});

test("serves protected JSON and isolates concurrent request tokens", async ({
  request,
}) => {
  const responses = await Promise.all([
    request.get("/api/protected"),
    request.get("/api/protected"),
  ]);
  const payloads = await Promise.all(
    responses.map(async (response) => {
      expect(response.ok()).toBe(true);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const raw = await response.text();
      expect(raw).not.toContain(FIRST);
      expect(raw).not.toContain(SECOND);
      return JSON.parse(raw) as { first: WirePayload; second: WirePayload };
    }),
  );
  expect(payloads[0].first.fontUrl).not.toBe(payloads[1].first.fontUrl);
  expect(payloads[0].first.fontUrl).toBe(payloads[0].second.fontUrl);

  const font = await request.get(payloads[0].first.fontUrl);
  expect(font.status()).toBe(200);
  expect(font.headers()["content-type"]).toContain("font/woff2");
  expect(font.headers()["cache-control"]).toContain("private");
  const head = await request.head(payloads[1].first.fontUrl);
  expect(head.status()).toBe(200);
  expect((await head.body()).byteLength).toBe(0);
});

test("rejects an expired Nuxt-issued font token", async ({ request }) => {
  const response = await request.get("/api/protected");
  const payload = (await response.json()) as { first: WirePayload };
  await new Promise((resolve) => setTimeout(resolve, 9_000));
  const expired = await request.get(payload.first.fontUrl);
  expect(expired.status()).toBe(401);
  expect(expired.headers()["cache-control"]).toContain("no-store");
});

test("commits route-scoped headers before delayed stream scrambling", async ({
  request,
}) => {
  const response = await request.get("/streamed");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const raw = await response.text();
  expect(raw).not.toContain(STREAMED);
  const payload = JSON.parse(raw) as WirePayload;
  expect(payload.encodedText).not.toBe(STREAMED);
  expect((await request.get(payload.fontUrl)).status()).toBe(200);
});

test("preserves ordinary route caching and fails visibly when its font fails", async ({
  page,
  request,
}) => {
  const ordinary = await request.get("/unprotected");
  expect(ordinary.ok()).toBe(true);
  expect(ordinary.headers()["cache-control"] ?? "").not.toContain("no-store");

  await page.route("**/_glyphscramble/font/**", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/protected");
  const block = page.getByTestId("protected-first");
  await expect(block).toHaveAttribute("data-glyphscramble", "error");
  await expect(block).toHaveText("Protected fixture unavailable.");
  await expect(block).toBeVisible();
});
