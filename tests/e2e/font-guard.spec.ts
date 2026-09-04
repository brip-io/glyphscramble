import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { build as EsbuildBuild } from "esbuild";

const require = createRequire(
  join(process.cwd(), "packages/core/package.json"),
);
const { build } = require("esbuild") as { build: typeof EsbuildBuild };
const interPath =
  require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
const runtimePath = join(process.cwd(), "packages/core/dist/browser.js");
let fontBytes: Buffer;
let runtimeSource: string;

test.beforeAll(async () => {
  fontBytes = await readFile(interPath);
  const bundled = await build({
    entryPoints: [runtimePath],
    bundle: true,
    format: "iife",
    globalName: "GlyphRuntime",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  runtimeSource = bundled.outputFiles[0]!.text;
});

function payload(suffix = "0123456789abcdef") {
  const fontToken = `v2.current.${suffix}`;
  return {
    version: 3,
    encodedText: "Vhfuhw",
    font: "body",
    face: {
      id: "regular",
      family: `GlyphScramble-body-regular-${suffix}`,
      weight: "400",
      style: "normal",
      stretch: "normal",
      unicodeRange: ["U+0020-007E"],
    },
    fontUrl: `/_glyphscramble/font/${fontToken}/body%40regular.woff2`,
    expiresAt: Math.floor(Date.now() / 1_000) + 60,
    coverage: suffix.repeat(4),
    lang: "en",
    cspNonce: "browserNonce",
  };
}

async function serveRuntime(
  page: Page,
  appSource: string,
  options: { delayFont?: (url: URL) => number; failFont?: boolean } = {},
): Promise<void> {
  await page.route("https://glyph.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/runtime.js") {
      await route.fulfill({
        contentType: "application/javascript",
        body: runtimeSource,
      });
      return;
    }
    if (url.pathname === "/app.js") {
      await route.fulfill({
        contentType: "application/javascript",
        body: appSource,
      });
      return;
    }
    if (url.pathname.endsWith(".woff2")) {
      const delay = options.delayFont?.(url) ?? 0;
      if (delay)
        await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
      if (options.failFont) {
        await route.fulfill({ status: 404, body: "missing" });
        return;
      }
      await route.fulfill({ contentType: "font/woff2", body: fontBytes });
      return;
    }
    await route.fulfill({
      contentType: "text/html",
      headers: {
        "content-security-policy":
          "default-src 'none'; script-src 'self'; font-src 'self'; style-src 'self' 'nonce-browserNonce'; style-src-attr 'none'",
      },
      body: `<!doctype html><meta charset="utf-8"><span id="one" hidden aria-hidden="true"></span><span id="two" hidden aria-hidden="true"></span><span id="three" hidden aria-hidden="true"></span><script src="/runtime.js"></script><script src="/app.js"></script>`,
    });
  });
  await page.goto("https://glyph.test/");
}

test("a protected block begins hidden and exposes no accessibility text", async ({
  page,
}) => {
  await page.setContent(
    '<p id="protected" hidden aria-hidden="true">Tdqfdu</p>',
  );
  const block = page.locator("#protected");
  await expect(block).toBeHidden();
  await expect(page.getByText("Secret")).toHaveCount(0);
  await expect(page.locator('[aria-hidden="true"]')).toHaveText("Tdqfdu");
});

test("strict-CSP duplicate mounts share one face until bounded expiry", async ({
  page,
}) => {
  const value = payload();
  value.expiresAt = Math.floor(Date.now() / 1_000) + 2;
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".woff2")) fontRequests.push(request.url());
  });
  await serveRuntime(
    page,
    `
      window.violations=[];
      document.addEventListener("securitypolicyviolation",event=>window.violations.push(event.violatedDirective));
      const payload=${JSON.stringify(value)};
      window.handles=[
        window.GlyphRuntime.mountGlyphPayload(document.querySelector("#one"),payload),
        window.GlyphRuntime.mountGlyphPayload(document.querySelector("#two"),payload),
      ];
      Promise.all(window.handles.map(handle=>handle.ready)).then(results=>window.mountResults=results);
    `,
  );

  await page.waitForFunction(
    () => document.querySelector("#two")?.dataset.glyphscramble === "ready",
  );
  await expect(page.locator("#one")).toHaveAttribute(
    "data-glyphscramble",
    "ready",
  );
  await expect(page.locator("#one")).toHaveAttribute("lang", "en");
  await expect(page.locator("#one")).not.toHaveAttribute("style", /.+/);
  await expect(page.locator("style")).toHaveCount(1);
  expect(
    await page
      .locator("style")
      .evaluateAll((styles) =>
        styles.map((style) => (style as HTMLStyleElement).nonce),
      ),
  ).toEqual(["browserNonce"]);
  expect(
    await page.evaluate(() => Reflect.get(window, "mountResults")),
  ).toEqual(["ready", "ready"]);
  expect(await page.evaluate(() => Reflect.get(window, "violations"))).toEqual(
    [],
  );

  await page.evaluate(() => Reflect.get(window, "handles")[0].destroy());
  await expect(page.locator("style")).toHaveCount(1);
  await page.evaluate(() => Reflect.get(window, "handles")[1].destroy());
  await expect(page.locator("style")).toHaveCount(1);
  expect(fontRequests).toHaveLength(1);
  await expect(page.locator("style")).toHaveCount(0, { timeout: 3_000 });
});

test("regular/bold/regular blocks request each stable-token face once", async ({
  page,
}) => {
  const regular = payload();
  const bold = structuredClone(regular);
  bold.face.id = "bold";
  bold.face.family = "GlyphScramble-body-bold-0123456789abcdef";
  bold.face.weight = "700";
  bold.fontUrl = bold.fontUrl.replace(
    "body%40regular.woff2",
    "body%40bold.woff2",
  );
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".woff2")) fontRequests.push(request.url());
  });

  await serveRuntime(
    page,
    `
      const regular=${JSON.stringify(regular)};
      const bold=${JSON.stringify(bold)};
      window.handles=[
        window.GlyphRuntime.mountGlyphPayload(document.querySelector("#one"),regular),
        window.GlyphRuntime.mountGlyphPayload(document.querySelector("#two"),bold),
        window.GlyphRuntime.mountGlyphPayload(document.querySelector("#three"),structuredClone(regular)),
      ];
      Promise.all(window.handles.map(handle=>handle.ready)).then(results=>window.mountResults=results);
    `,
  );

  await page.waitForFunction(
    () => document.querySelector("#three")?.dataset.glyphscramble === "ready",
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "mountResults")),
  ).toEqual(["ready", "ready", "ready"]);
  expect(new Set(fontRequests.map((url) => new URL(url).pathname)).size).toBe(
    2,
  );
  expect(fontRequests).toHaveLength(2);
});

test("a rapid payload update aborts stale completion", async ({ page }) => {
  const first = payload();
  const next = payload("fedcba9876543210");
  next.encodedText = "Qhaw";
  await serveRuntime(
    page,
    `
      const first=${JSON.stringify(first)};
      const next=${JSON.stringify(next)};
      const node=document.querySelector("#one");
      window.handle=window.GlyphRuntime.mountGlyphPayload(node,first);
      const updated=window.handle.update(next);
      Promise.all([window.handle.ready,updated]).then(results=>window.mountResults=results);
    `,
    {
      delayFont: (url) => (url.pathname.includes("0123456789abcdef") ? 250 : 0),
    },
  );

  await page.waitForFunction(
    () => document.querySelector("#one")?.dataset.glyphscramble === "ready",
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "mountResults")),
  ).toEqual(["aborted", "ready"]);
  await expect(page.locator("#one")).toHaveText("Qhaw");
  await page.waitForTimeout(300);
  await expect(page.locator("#one")).toHaveText("Qhaw");
  await expect(page.locator("style")).toHaveCount(1);
});

test("a failed font shows only the generic aria-hidden state", async ({
  page,
}) => {
  await serveRuntime(
    page,
    `
      const value=${JSON.stringify(payload())};
      window.handle=window.GlyphRuntime.mountGlyphPayload(document.querySelector("#one"),value,{timeoutMs:100,errorText:"Protected block unavailable."});
      window.handle.ready.then(result=>window.mountResult=result);
    `,
    { failFont: true },
  );

  await page.waitForFunction(
    () => document.querySelector("#one")?.dataset.glyphscramble === "error",
  );
  await expect(page.locator("#one")).toBeVisible();
  await expect(page.locator("#one")).toHaveText("Protected block unavailable.");
  await expect(page.locator("#one")).toHaveAttribute("aria-hidden", "true");
  expect(await page.locator("#one").ariaSnapshot()).not.toContain("Vhfuhw");
  await expect(page.locator("style")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "mountResult"))).toBe(
    "error",
  );
});
