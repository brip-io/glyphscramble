import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { TransformGlyphHtmlResponseOptions } from "../../packages/core/src/response-boundary.js";
import type {
  GlyphEngine,
  ResponseContext,
} from "../../packages/core/src/types.js";

const require = createRequire(
  join(process.cwd(), "packages/core/package.json"),
);
const interPath =
  require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
const sourceText = "Secret Value Mark q́";
const oldSecret = process.env.GLYPHSCRAMBLE_SECRET;
let root: string;
let originalFont: Buffer;
let engine: GlyphEngine;
let transformGlyphHtmlResponse: (
  response: Response,
  context: ResponseContext,
  options?: TransformGlyphHtmlResponseOptions,
) => Promise<Response>;

test.beforeAll(async () => {
  const core = await import("../../packages/core/dist/index.js");
  const { createGlyphEngine, defineGlyphConfig, prepareGlyphFonts } = core;
  transformGlyphHtmlResponse = core.transformGlyphHtmlResponse;
  root = await mkdtemp(join(tmpdir(), "glyphscramble-response-browser-"));
  await mkdir(join(root, "licenses"));
  await writeFile(join(root, "licenses/OFL.txt"), "fixture license");
  originalFont = await readFile(interPath);
  process.env.GLYPHSCRAMBLE_SECRET =
    "response boundary browser fixture secret at least 32 chars";
  const config = defineGlyphConfig({
    fonts: {
      body: {
        source: { kind: "file", path: interPath },
        license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
        coverage: ["U+0020-007E", "U+0300-0304"],
      },
    },
    rotation: {
      scope: "response",
      secretEnv: "GLYPHSCRAMBLE_SECRET",
      tokenTtlSeconds: 600,
    },
    runtime: { poolLowWatermark: 3, poolHighWatermark: 4 },
    routePrefix: "/_glyphscramble",
    unsupported: "error",
    accessibilityRiskAcknowledged: true,
  });
  await prepareGlyphFonts(config, { cwd: root });
  engine = await createGlyphEngine(config, { cwd: root });
});

test.afterAll(async () => {
  await engine?.close();
  await rm(root, { recursive: true, force: true });
  if (oldSecret === undefined) delete process.env.GLYPHSCRAMBLE_SECRET;
  else process.env.GLYPHSCRAMBLE_SECRET = oldSecret;
});

const componentCss =
  "body{margin:0}.research{box-sizing:border-box;width:420px;padding:20px;font-size:20px;line-height:1.4;font-weight:400;font-style:normal}";

function markedHtml(csp = false): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style${csp ? ' nonce="browserNonce"' : ""}>${componentCss}</style></head><body><article class="research" data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1"><p>${sourceText}</p><p><strong>Nested emphasis</strong></p></article></body></html>`;
}

function originalHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Original;src:url('/original.woff2') format('woff2');font-weight:400;font-style:normal}${componentCss}.research,.research *{font-family:Original!important}</style></head><body><article class="research"><p>${sourceText}</p><p><strong>Nested emphasis</strong></p></article></body></html>`;
}

async function serve(
  page: Page,
  options: { csp?: boolean; failFont?: boolean } = {},
): Promise<void> {
  await page.route("https://response.glyph.test/**", async (route) => {
    const requestUrl = route.request().url();
    const url = new URL(requestUrl);
    if (url.pathname === "/original.woff2") {
      await route.fulfill({ contentType: "font/woff2", body: originalFont });
      return;
    }
    if (url.pathname.startsWith("/_glyphscramble/font/")) {
      if (options.failFont) {
        await route.fulfill({ status: 404, body: "missing" });
        return;
      }
      const response = await engine.fontResponse(new Request(requestUrl));
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
      return;
    }
    if (url.pathname === "/original") {
      await route.fulfill({ contentType: "text/html", body: originalHtml() });
      return;
    }
    const context = engine.beginResponse({ faces: [{ font: "body" }] });
    const headers: HeadersInit = { "content-type": "text/html; charset=utf-8" };
    if (options.csp)
      headers["content-security-policy"] =
        "default-src 'none'; font-src 'self'; img-src 'self'; script-src 'nonce-browserNonce'; style-src 'nonce-browserNonce'";
    const response = await transformGlyphHtmlResponse(
      new Response(markedHtml(options.csp), { headers }),
      context,
      {
        fontTimeoutMs: 1_000,
        ...(options.csp ? { cspNonce: "browserNonce" } : {}),
      },
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

test("response output is plaintext-free and visually equivalent", async ({
  page,
}) => {
  await serve(page);
  const navigation = await page.goto("https://response.glyph.test/");
  expect(navigation?.headers()["cache-control"]).toBe("private, no-store");
  const html = await page.content();
  expect(html).not.toContain(sourceText);
  expect(html).not.toContain("Nested emphasis");

  await page.goto("https://response.glyph.test/original");
  await page.evaluate(() => document.fonts.ready);
  const original = PNG.sync.read(
    await page.locator(".research").screenshot({ animations: "disabled" }),
  );
  await page.goto("https://response.glyph.test/");
  const protectedBlock = page.locator(
    '[data-glyphscramble-source="response-output-v1"]',
  );
  await expect(protectedBlock).toHaveAttribute(
    "data-glyphscramble-state",
    "ready",
  );
  const scrambled = PNG.sync.read(
    await protectedBlock.screenshot({ animations: "disabled" }),
  );
  expect(scrambled.width).toBe(original.width);
  expect(scrambled.height).toBe(original.height);
  const different = pixelmatch(
    original.data,
    scrambled.data,
    null,
    original.width,
    original.height,
    { threshold: 0.2 },
  );
  expect(different / (original.width * original.height)).toBeLessThanOrEqual(
    0.002,
  );
});

test("strict CSP nonce permits the response guard without violations", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") violations.push(message.text());
  });
  await serve(page, { csp: true });
  await page.goto("https://response.glyph.test/");
  await expect(
    page.locator('[data-glyphscramble-source="response-output-v1"]'),
  ).toHaveAttribute("data-glyphscramble-state", "ready");
  expect(violations).toEqual([]);
});

test("font failure stays hidden and exposes only the generic status", async ({
  page,
}) => {
  await serve(page, { failFont: true });
  await page.goto("https://response.glyph.test/");
  const protectedBlock = page.locator(
    '[data-glyphscramble-source="response-output-v1"]',
  );
  await expect(protectedBlock).toHaveAttribute(
    "data-glyphscramble-state",
    "error",
  );
  await expect(protectedBlock).toBeHidden();
  const status = page.locator("[data-glyphscramble-response-status]");
  await expect(status).toBeVisible();
  await expect(status).toHaveText(
    "This protected content could not be displayed.",
  );
  expect(await status.ariaSnapshot()).not.toContain(sourceText);
});

test("no-JavaScript clients keep content hidden and reveal a generic status", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await serve(page);
    const navigation = await page.goto("https://response.glyph.test/");
    expect(await navigation?.text()).not.toContain(sourceText);
    const protectedBlock = page.locator(
      '[data-glyphscramble-source="response-output-v1"]',
    );
    await expect(protectedBlock).toBeHidden();
    const status = page.locator("[data-glyphscramble-response-status]");
    await expect(status).toBeVisible({ timeout: 2_000 });
    await expect(status).toHaveText(
      "This protected content could not be displayed.",
    );
  } finally {
    await context.close();
  }
});
