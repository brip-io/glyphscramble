import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { expect, test } from "@playwright/test";

const ASTRO = "http://127.0.0.1:4322";
const VITE = "http://127.0.0.1:4174/vite-static/";
const NODE = "http://127.0.0.1:3211";

async function textArtifacts(root: string): Promise<string[]> {
  const values: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if ([".html", ".js", ".css", ".json"].includes(extname(path)))
        values.push(await readFile(path, "utf8"));
    }
  }
  await visit(root);
  return values;
}

test("Astro buffers lazy rendering before applying selective headers", async ({
  request,
}) => {
  const plain = await request.get(`${ASTRO}/plain`);
  expect(plain.headers()["cache-control"]).toBe("public, max-age=3600");
  expect(plain.headers()["x-glyphscramble"]).toBeUndefined();

  const lazy = await request.get(`${ASTRO}/lazy`);
  expect(lazy.headers()["cache-control"]).toBe("private, no-store");
  expect(lazy.headers()["x-glyphscramble"]).toBe("response-rotated");
  const body = await lazy.text();
  expect(body).not.toContain("Lazy Astro stream value");
  expect(JSON.parse(body)).toMatchObject({
    version: 3,
    encodedText: expect.any(String),
  });
});

test("Astro SSR emits no plaintext and mounts one lifecycle per block", async ({
  page,
  request,
}) => {
  const raw = await request.get(`${ASTRO}/`);
  expect(raw.headers()["cache-control"]).toBe("private, no-store");
  expect(await raw.text()).not.toContain("Astro protected value");

  await page.goto(`${ASTRO}/`);
  const content = page.locator("brip-glyphscramble-v3 > [data-content]");
  await expect(content).toHaveAttribute("data-glyphscramble", "ready");
  await expect(content).toBeVisible();
  await expect(content).not.toHaveText("Astro protected value");
  expect(
    await content.evaluate((node) => getComputedStyle(node).fontFamily),
  ).toContain("GlyphScramble-");
});

test("Astro shows the localized generic error when its font fails", async ({
  page,
}) => {
  await page.route("**/_glyphscramble/font/**", (route) => route.abort());
  await page.goto(`${ASTRO}/`);
  const content = page.locator("brip-glyphscramble-v3 > [data-content]");
  await expect(content).toHaveAttribute("data-glyphscramble", "error");
  await expect(content).toHaveText("Protected Astro content unavailable.");
  await expect(content).toBeVisible();
});

test("Vite publishes a fresh subpath-safe static build", async ({
  page,
  request,
}) => {
  const raw = await request.get(VITE);
  const html = await raw.text();
  expect(html).not.toContain("Vite protected value");
  expect(html).toContain("Indexable Vite heading");
  expect(html).toContain("/vite-static/_glyphscramble/");

  await page.goto(VITE);
  const content = page.locator("[data-glyphscramble-font]");
  await expect(content).toHaveAttribute("data-glyphscramble-state", "ready");
  await expect(content).toBeVisible();
  expect(
    await readFile(
      join(process.cwd(), "examples/vite-static/dist-site/index.html"),
      "utf8",
    ),
  ).not.toContain("Vite protected value");
  for (const artifact of await textArtifacts(
    join(process.cwd(), "examples/vite-static/dist-site"),
  ))
    expect(artifact).not.toContain("Vite protected value");
});

test("Astro static output is non-hydrated and plaintext-free", async () => {
  const html = await readFile(
    join(process.cwd(), "examples/astro/dist-static/index.html"),
    "utf8",
  );
  expect(html).not.toContain("Static Astro protected value");
  expect(html).toContain("Indexable static Astro heading");
  expect(html).toContain("/astro-static/_glyphscramble/");
  expect(html).not.toContain("astro-island");
  for (const artifact of await textArtifacts(
    join(process.cwd(), "examples/astro/dist-static"),
  ))
    expect(artifact).not.toContain("Static Astro protected value");
});

test("generic Node/Fetch integration rotates and preserves plain caching", async ({
  page,
  request,
}) => {
  const plain = await request.get(`${NODE}/plain`);
  expect(plain.headers()["cache-control"]).toBe("public, max-age=3600");

  const first = await request.get(`${NODE}/`);
  const second = await request.get(`${NODE}/`);
  const firstHtml = await first.text();
  const secondHtml = await second.text();
  expect(first.headers()["cache-control"]).toBe("private, no-store");
  expect(firstHtml).not.toContain("Node Fetch protected value");
  expect(secondHtml).not.toBe(firstHtml);

  await page.goto(`${NODE}/`);
  const content = page.locator("[data-glyphscramble-node]");
  await expect(content).toHaveAttribute("data-glyphscramble", "ready");
  await expect(content).toBeVisible();
});

test("generic Node/Fetch integration propagates client aborts", async ({
  request,
}) => {
  const before = Number(
    await (await request.get(`${NODE}/abort-count`)).text(),
  );
  const controller = new globalThis.AbortController();
  const pending = globalThis.fetch(`${NODE}/wait-for-abort`, {
    signal: controller.signal,
  });
  globalThis.setTimeout(() => controller.abort(), 25);
  await expect(pending).rejects.toThrow(/abort/i);
  await expect
    .poll(async () =>
      Number(await (await request.get(`${NODE}/abort-count`)).text()),
    )
    .toBe(before + 1);
  expect((await request.get(`${NODE}/plain`)).ok()).toBe(true);
});
