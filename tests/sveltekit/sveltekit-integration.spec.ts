import { expect, test } from "@playwright/test";

const FIRST = "Sensitive analyst note alpha.";
const SECOND = "Sensitive analyst note beta.";
const STREAMED = "Delayed protected stream content.";
const PRIVATE_ERROR = "Sensitive error payload must stay server-only.";

interface WirePayload {
  encodedText: string;
  fontUrl: string;
}

test("keeps plaintext out of SSR, serialized data, client chunks, and errors", async ({
  request,
}) => {
  const response = await request.get("/protected?source=qualified-route");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-existing-hook"]).toBe("composed");
  const html = await response.text();
  expect(html).not.toContain(FIRST);
  expect(html).not.toContain(SECOND);

  const scripts = [
    ...html.matchAll(
      /(?:src=|import\()["']([^"']*\/_app\/immutable\/[^"']+\.js)/g,
    ),
  ].map((match) => match[1]!);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    const source = await (await request.get(script)).text();
    expect(source).not.toContain(FIRST);
    expect(source).not.toContain(SECOND);
    expect(source).not.toContain(PRIVATE_ERROR);
  }

  const error = await request.get("/error");
  expect(error.status()).toBe(500);
  expect(await error.text()).not.toContain(PRIVATE_ERROR);
});

test("renders, updates, clones, navigates, and rotates without stale mounts", async ({
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
  await expect(page.getByTestId("existing-hook")).toHaveText("true");
  const firstEncoded = await first.textContent();
  const firstUrl = await first.getAttribute("data-font-url");
  expect(firstEncoded).not.toBe(FIRST);
  expect(await second.getAttribute("data-font-url")).toBe(firstUrl);

  await first.evaluate((element) => {
    const transitions: string[] = [];
    new MutationObserver(() => {
      transitions.push(element.getAttribute("data-glyphscramble") ?? "missing");
    }).observe(element, {
      attributes: true,
      attributeFilter: ["data-glyphscramble"],
    });
    Object.assign(window, { __glyphscrambleTransitions: transitions });
  });
  await page.getByTestId("clone-payload").click();
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __glyphscrambleTransitions?: string[] })
          .__glyphscrambleTransitions,
    ),
  ).toEqual([]);

  await page.getByTestId("replace-payload").click();
  await expect(first).toHaveAttribute("data-glyphscramble", "ready");
  await expect.poll(() => first.textContent()).not.toBe(firstEncoded);
  await expect
    .poll(() => first.getAttribute("data-font-url"))
    .not.toBe(firstUrl);
  const replacementUrl = await first.getAttribute("data-font-url");

  await page.getByRole("link", { name: "Unprotected example" }).click();
  await expect(page).toHaveURL(/\/unprotected$/);
  await page.getByRole("link", { name: "Open protected content" }).click();
  const restored = page.getByTestId("protected-first");
  await expect(restored).toHaveAttribute("data-glyphscramble", "ready");
  expect(await restored.getAttribute("data-font-url")).not.toBe(replacementUrl);
});

test("isolates requests and serves only the configured font endpoint", async ({
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

  const unrelated = await request.get("/api/unrelated");
  expect(unrelated.ok()).toBe(true);
  expect(unrelated.headers()["cache-control"] ?? "").not.toContain("no-store");
  expect(await unrelated.json()).toEqual({
    ok: true,
    existingHookVisited: true,
  });
});

test("rejects an expired SvelteKit-issued font token", async ({ request }) => {
  const response = await request.get("/api/protected");
  const payload = (await response.json()) as { first: WirePayload };
  await new Promise((resolve) => setTimeout(resolve, 9_000));
  const expired = await request.get(payload.first.fontUrl);
  expect(expired.status()).toBe(401);
  expect(expired.headers()["cache-control"]).toContain("no-store");
});

test("protects deferred load data before streamed bytes commit", async ({
  page,
  request,
}) => {
  const response = await request.get("/streamed");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const html = await response.text();
  expect(html).not.toContain(STREAMED);

  await page.goto("/streamed");
  await expect(page.getByTestId("streamed-block")).toHaveAttribute(
    "data-glyphscramble",
    "ready",
  );
});

test("cancels stale completion during a rapid payload replacement", async ({
  page,
}) => {
  let firstFont = true;
  await page.route("**/_glyphscramble/font/**", async (route) => {
    if (firstFont) {
      firstFont = false;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await route.continue();
  });
  await page.goto("/protected");
  const block = page.getByTestId("protected-first");
  const initial = await block.textContent();
  await page.getByTestId("replace-payload").click();
  await expect(block).toHaveAttribute("data-glyphscramble", "ready");
  await expect.poll(() => block.textContent()).not.toBe(initial);
  const replacement = await block.textContent();
  await page.waitForTimeout(500);
  expect(await block.textContent()).toBe(replacement);
  await expect(block).toHaveAttribute("data-glyphscramble", "ready");
});

test("shows only the localized generic state when a font fails", async ({
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
