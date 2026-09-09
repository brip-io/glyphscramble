import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { defineGlyphConfig } from "../../packages/core/src/config.js";
import { prepareGlyphFonts } from "../../packages/core/src/font-pipeline.js";
import { buildStaticSite } from "../../packages/core/src/static-output.js";

const require = createRequire(
  join(process.cwd(), "packages/core/package.json"),
);
const interPath =
  require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
let root: string;
let output: string;

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "glyphscramble-static-browser-"));
  output = join(root, "published");
  await mkdir(join(root, "source/nested"), { recursive: true });
  await mkdir(join(root, "licenses"));
  await writeFile(join(root, "licenses/OFL.txt"), "fixture license");
  await writeFile(
    join(root, "source/component.css"),
    "body{margin:0}.research{box-sizing:border-box;width:420px;padding:20px;font-size:20px;line-height:1.4}.component-copy{font-family:Georgia,serif}.vertical{writing-mode:vertical-rl}#ordinary-font{font-family:Georgia,serif!important}",
  );
  await writeFile(
    join(root, "source/nested/page.html"),
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/docs/component.css"></head><body><article id="protected" class="research" data-glyphscramble-font="body" data-glyphscramble-source="static-boundary-v1"><div><p class="component-copy">Secret <strong>Value</strong> Mark q́</p><p dir="rtl">Right to left</p><p class="vertical">Vertical</p><table><tbody><tr><th>Metric</th><td>Seven</td></tr></tbody></table></div></article></body></html>',
  );
  await writeFile(
    join(root, "source/override.html"),
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/docs/component.css"></head><body><article id="protected" data-glyphscramble-font="body" data-glyphscramble-source="static-boundary-v1"><span id="ordinary-font">Secret Value</span></article></body></html>',
  );
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
    routePrefix: "/_glyphscramble",
    unsupported: "error",
    accessibilityRiskAcknowledged: true,
  });
  await prepareGlyphFonts(config, { cwd: root });
  await buildStaticSite(config, {
    cwd: root,
    inputDir: "source",
    outputDir: "published",
    seed: "static-browser-seed",
    publicBasePath: "/docs",
    fontLoadTimeoutMs: 150,
  });
});

test.afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const contentTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

async function serve(
  page: Page,
  options: {
    csp?: string;
    font?: "ok" | "missing" | "corrupt";
    path?: string;
  } = {},
): Promise<void> {
  await page.route("https://static.glyph.test/**", async (route) => {
    const url = new URL(route.request().url());
    const relative = url.pathname
      .replace(/^\/docs\/?/, "")
      .replace(/^$/, "nested/page.html");
    const file = join(output, relative);
    if (extname(file) === ".woff2" && options.font === "missing") {
      await route.fulfill({ status: 404, body: "missing" });
      return;
    }
    if (extname(file) === ".woff2" && options.font === "corrupt") {
      await route.fulfill({ contentType: "font/woff2", body: "not a font" });
      return;
    }
    try {
      await route.fulfill({
        contentType: contentTypes[extname(file)] ?? "application/octet-stream",
        headers:
          extname(file) === ".html"
            ? {
                "content-security-policy":
                  options.csp ??
                  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'",
              }
            : {},
        body: await readFile(file),
      });
    } catch {
      await route.fulfill({ status: 404, body: "missing" });
    }
  });
  await page.goto(`https://static.glyph.test/docs/${options.path ?? ""}`, {
    waitUntil: "domcontentloaded",
  });
}

async function serveOriginal(page: Page): Promise<void> {
  await page.route("https://original.glyph.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/original.woff2") {
      await route.fulfill({
        contentType: "font/woff2",
        body: await readFile(interPath),
      });
      return;
    }
    await route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:OriginalInter;src:url("/original.woff2") format("woff2");font-weight:400;font-style:normal;font-stretch:normal}body{margin:0}.research{box-sizing:border-box;width:420px;padding:20px;font:400 20px/1.4 OriginalInter}.component-copy{font-family:OriginalInter!important}.vertical{writing-mode:vertical-rl}</style></head><body><article id="reference" class="research"><div><p class="component-copy">Secret <strong>Value</strong> Mark q́</p><p dir="rtl">Right to left</p><p class="vertical">Vertical</p><table><tbody><tr><th>Metric</th><td>Seven</td></tr></tbody></table></div></article></body></html>',
    });
  });
  await page.goto("https://original.glyph.test/", {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts.ready);
}

test("strict CSP reveals only after the exact static face loads", async ({
  page,
}) => {
  await serve(page);
  const block = page.locator("#protected");
  await expect(block).toHaveAttribute("data-glyphscramble-state", "ready");
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("status")).toBeHidden();
  expect(await block.textContent()).not.toContain("Secret Value");
  const family = await block.getAttribute("data-glyphscramble-family");
  for (const selector of [".component-copy", "strong", "td"])
    expect(
      await block
        .locator(selector)
        .evaluate((element) => getComputedStyle(element).fontFamily),
    ).toContain(family);
});

test("a higher-specificity descendant font override fails closed", async ({
  page,
}) => {
  await serve(page, { path: "override.html" });
  const block = page.locator("#protected");
  await expect(block).toHaveAttribute("data-glyphscramble-state", "error");
  await expect(block).toBeHidden();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Secret Value");
});

test("the nested boundary is pixel-equivalent to the original face", async ({
  page,
}) => {
  await serve(page);
  const block = page.locator("#protected");
  await expect(block).toHaveAttribute("data-glyphscramble-state", "ready");
  const protectedPixels = await block.screenshot({ animations: "disabled" });

  await serveOriginal(page);
  const originalPixels = await page
    .locator("#reference")
    .screenshot({ animations: "disabled" });
  expect(protectedPixels).toEqual(originalPixels);
});

for (const font of ["missing", "corrupt"] as const) {
  test(`a ${font} font fails closed with a separate accessible status`, async ({
    page,
  }) => {
    await serve(page, { font });
    const block = page.locator("#protected");
    await expect(block).toHaveAttribute("data-glyphscramble-state", "error");
    await expect(block).toBeHidden();
    await expect(block).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      "This protected content could not be displayed.",
    );
    await expect(page.locator("body")).not.toContainText("Secret Value");
  });
}

test("a blocked loader leaves content hidden and reveals the generic status", async ({
  page,
}) => {
  await serve(page, {
    csp: "default-src 'none'; script-src 'none'; style-src 'self'; font-src 'self'",
  });
  const block = page.locator("#protected");
  await expect(block).toBeHidden();
  await expect(block).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("status")).toBeVisible({ timeout: 2_000 });
});

test("a blocked stylesheet cannot reveal encoded content", async ({ page }) => {
  await serve(page, {
    csp: "default-src 'none'; script-src 'self'; style-src 'none'; font-src 'self'",
  });
  const block = page.locator("#protected");
  await expect(block).toHaveAttribute("data-glyphscramble-state", "error");
  await expect(block).toBeHidden();
  await expect(page.getByRole("status")).toBeVisible();
});
