import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { defineGlyphConfig } from "../src/config.js";
import { prepareGlyphFonts } from "../src/font-pipeline.js";
import { StaticBuildPlanner } from "../src/static-plan.js";
import {
  buildStaticSite,
  staticGlyphCspDirectives,
  verifyStaticOutput,
} from "../src/static-output.js";
import { syntheticFont } from "./fixture.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-static-"));
  roots.push(cwd);
  await mkdir(join(cwd, "fonts"));
  await mkdir(join(cwd, "licenses"));
  await writeFile(join(cwd, "fonts/body.ttf"), syntheticFont());
  await writeFile(join(cwd, "licenses/OFL.txt"), "fixture license");
  const config = defineGlyphConfig({
    fonts: {
      body: {
        source: { kind: "file", path: "./fonts/body.ttf" },
        license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
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
  await prepareGlyphFonts(config, { cwd });
  return { cwd, config };
}

async function treeBytes(root: string): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  const visit = async (directory: string, prefix = ""): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, path);
      else
        output[path] = createHash("sha256")
          .update(await readFile(absolute))
          .digest("hex");
    }
  };
  await visit(root);
  return output;
}

describe("static build planner and publisher", () => {
  it("provides the external-only strict CSP contract", () => {
    expect(staticGlyphCspDirectives()).toEqual({
      "default-src": ["'none'"],
      "script-src": ["'self'"],
      "style-src": ["'self'"],
      "font-src": ["'self'"],
    });
  });

  it("publishes idempotently from source and preserves unmarked bytes", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source/assets"), { recursive: true });
    const marked =
      '<!doctype html><html><head><title>Public</title></head><body><article data-glyphscramble-font="body">Secret Value</article><p>Indexable copy</p></body></html>';
    const unmarked =
      "<!DOCTYPE html>\n<HTML><HEAD><TITLE>  Exact bytes </TITLE></HEAD><BODY>Untouched &amp; public</BODY></HTML>\n";
    const asset = new Uint8Array([0, 255, 1, 2, 127]);
    await writeFile(join(cwd, "source/index.html"), marked);
    await writeFile(join(cwd, "source/untouched.html"), unmarked);
    await writeFile(join(cwd, "source/assets/value.bin"), asset);
    const inputBefore = await treeBytes(join(cwd, "source"));

    const first = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      seed: "stable-static-seed",
    });
    const firstOutput = await treeBytes(join(cwd, "published"));
    await writeFile(join(cwd, "published/stale.txt"), "stale output");
    const second = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      seed: "stable-static-seed",
    });

    expect(await treeBytes(join(cwd, "source"))).toEqual(inputBefore);
    expect(await treeBytes(join(cwd, "published"))).toEqual(firstOutput);
    expect(await readFile(join(cwd, "published/untouched.html"), "utf8")).toBe(
      unmarked,
    );
    expect(
      new Uint8Array(await readFile(join(cwd, "published/assets/value.bin"))),
    ).toEqual(asset);
    const protectedHtml = await readFile(
      join(cwd, "published/index.html"),
      "utf8",
    );
    expect(protectedHtml).not.toContain("Secret Value");
    expect(protectedHtml).toContain("Indexable copy");
    for (const artifact of [
      "index.html",
      first.manifestFile,
      ...first.manifest.assets
        .filter((item) => item.kind === "style" || item.kind === "script")
        .map((item) => item.path),
    ])
      expect(
        await readFile(join(cwd, "published", artifact), "utf8"),
      ).not.toContain("Secret Value");
    expect(first.transformedFiles).toEqual(["index.html"]);
    expect(second.manifest).toEqual(first.manifest);
    expect(JSON.stringify(first.manifest)).not.toContain("Secret Value");
    expect(JSON.stringify(first.manifest)).not.toContain("stable-static-seed");
    expect(first.manifest).toMatchObject({
      version: 3,
      algorithm: "glyphscramble-static-v3",
      publicBasePath: "/",
      fonts: ["body"],
      transformedFiles: ["index.html"],
    });
    expect(protectedHtml).toContain('aria-hidden="true"');
    expect(protectedHtml).toContain('hidden=""');
    expect(protectedHtml).toContain('role="status"');
    expect(protectedHtml).toContain(first.manifest.buildId);
    expect(await verifyStaticOutput(join(cwd, "published"))).toEqual([
      expect.objectContaining({
        severity: "info",
        code: "STATIC-OUTPUT-OK",
      }),
    ]);
    expect(first.manifest.sourceHtml).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "untouched.html",
          transformed: false,
          sourceSha256: createHash("sha256").update(unmarked).digest("hex"),
        }),
      ]),
    );
  });

  it("emits content-addressed assets for root, subpath, and nested routes", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source/nested"), { recursive: true });
    await writeFile(
      join(cwd, "source/nested/page.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Secret</article></body></html>',
    );
    const result = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      seed: "subpath-seed",
      publicBasePath: "/docs/",
      fontLoadTimeoutMs: 250,
    });
    const html = await readFile(
      join(cwd, "published/nested/page.html"),
      "utf8",
    );
    expect(result.manifest.publicBasePath).toBe("/docs");
    expect(result.manifest.fontLoadTimeoutMs).toBe(250);
    expect(html).toContain(`/docs/${result.manifest.assetDirectory}/static.`);
    expect(html).toContain(`/docs/${result.manifestFile}`);
    for (const asset of result.manifest.assets) {
      expect(await readFile(join(cwd, "published", asset.path))).toHaveLength(
        asset.bytes,
      );
      if (asset.kind !== "license") expect(asset.path).toContain(asset.sha256);
    }
    expect(result.manifestFile).toMatch(
      /glyphscramble-static-manifest\.[a-f0-9]{64}\.json$/,
    );
  });

  it("changes the build, font identity, and asset graph when the seed rotates", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><p data-glyphscramble-font="body">Secret</p></body></html>',
    );
    const first = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "first",
      seed: "first-seed",
    });
    const second = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "second",
      seed: "second-seed",
    });
    expect(second.manifest.buildId).not.toBe(first.manifest.buildId);
    expect(second.manifest.fontIdentities.body).not.toBe(
      first.manifest.fontIdentities.body,
    );
    expect(
      second.manifest.assets.find((asset) => asset.kind === "font")?.path,
    ).not.toBe(
      first.manifest.assets.find((asset) => asset.kind === "font")?.path,
    );
  });

  it("doctor rejects tampered assets and mixed build manifests", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><p data-glyphscramble-font="body">Secret</p></body></html>',
    );
    const first = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "first",
      seed: "first-seed",
    });
    const second = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "second",
      seed: "second-seed",
    });
    const css = first.manifest.assets.find((asset) => asset.kind === "style")!;
    await writeFile(join(cwd, "first", css.path), "tampered");
    expect(await verifyStaticOutput(join(cwd, "first"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STATIC-ASSET-HASH" }),
      ]),
    );

    const manifestPath = join(cwd, "first", first.manifestFile);
    const alteredManifest = {
      ...first.manifest,
      fontLoadTimeoutMs: first.manifest.fontLoadTimeoutMs + 1,
    };
    await writeFile(
      manifestPath,
      `${JSON.stringify(alteredManifest, null, 2)}\n`,
    );
    expect(await verifyStaticOutput(join(cwd, "first"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STATIC-MANIFEST-HASH" }),
        expect.objectContaining({ code: "STATIC-BUILD-ID" }),
      ]),
    );

    await mkdir(join(cwd, "first", second.manifest.assetDirectory), {
      recursive: true,
    });
    await copyFile(
      join(cwd, "second", second.manifestFile),
      join(cwd, "first", second.manifestFile),
    );
    expect(await verifyStaticOutput(join(cwd, "first"))).toEqual([
      expect.objectContaining({ code: "STATIC-MIXED-BUILD" }),
    ]);
  });

  it("leaves the previous publication untouched when transformation fails", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Secret</article></body></html>',
    );
    await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      seed: "first-seed",
    });
    const publishedBefore = await treeBytes(join(cwd, "published"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Unsupported ∑</article></body></html>',
    );

    await expect(
      buildStaticSite(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
        seed: "second-seed",
      }),
    ).rejects.toThrow(/No Unicode-safe mapping for U\+2211/);
    expect(await treeBytes(join(cwd, "published"))).toEqual(publishedBefore);
    expect((await readdir(cwd)).some((name) => name.includes("stage-"))).toBe(
      false,
    );
  });

  it.each([
    ["script", "<script>window.secret = 'Secret'</script>"],
    ["style", "<style>.secret { color: red }</style>"],
    ["noscript", "<noscript>Secret</noscript>"],
    ["template", "<template><p>Secret</p></template>"],
    ["textarea", "<textarea>Secret</textarea>"],
    ["form", "<form><span>Secret</span></form>"],
    ["input", '<input value="Secret">'],
    ["button", "<button>Secret</button>"],
    ["select", "<select><option>Secret</option></select>"],
    ["link", '<a href="/secret">Secret</a>'],
    ["plaintext attribute", '<img alt="Secret description">'],
  ])("rejects unsafe <%s> content during planning", async (_name, child) => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      `<html><head></head><body><article data-glyphscramble-font="body">${child}</article></body></html>`,
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
      }).plan(),
    ).rejects.toThrow(/index\.html .*unsafe/);
  });

  it.each([
    ["React", '<span data-reactroot="">Secret</span>'],
    ["Vue", '<span data-v-app="">Secret</span>'],
    ["Svelte", '<span data-svelte-h="abc">Secret</span>'],
    ["Astro", "<astro-island>Secret</astro-island>"],
    ["generic", '<span data-hydrate="true">Secret</span>'],
  ])("rejects %s hydration inside a protected block", async (_name, child) => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      `<html><head></head><body><article data-glyphscramble-font="body">${child}</article></body></html>`,
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
      }).plan(),
    ).rejects.toThrow(/hydrated boundary/);
  });

  it("rejects protected content inside a hydrated or interactive ancestor", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><div id="__next"><a href="/"><span data-glyphscramble-font="body">Secret</span></a></div></body></html>',
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
      }).plan(),
    ).rejects.toThrow(/unsafe ancestor|hydrated ancestor/);
  });

  it.each([
    [
      "Vite module entry",
      '<script type="module" src="/assets/index.js"></script>',
    ],
    [
      "Next flight payload",
      "<script>self.__next_f.push(['client payload'])</script>",
    ],
    ["Nuxt client entry", '<script src="/_nuxt/entry.js"></script>'],
    [
      "SvelteKit client entry",
      '<script src="/_app/immutable/entry/start.js"></script>',
    ],
  ])("rejects a document-level %s", async (_name, script) => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      `<html><head>${script}</head><body><article data-glyphscramble-font="body">Secret</article></body></html>`,
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
      }).plan(),
    ).rejects.toThrow(/document with a hydration boundary/);
  });

  it("finds protected markers inside template fragments and rejects comments", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><template><article data-glyphscramble-font="body">Secret</article></template></body></html>',
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
      }).plan(),
    ).rejects.toThrow(/unsafe ancestor.*template/i);

    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Visible<!-- Secret comment --></article></body></html>',
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
      }).plan(),
    ).rejects.toThrow(/comments.*plaintext/i);
  });

  it("supports custom hydration detectors", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body"><span data-acme-live="true">Secret</span></article></body></html>',
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
        hydrationDetectors: [
          {
            name: "Acme",
            detect: (element) =>
              "data-acme-live" in element.attributes
                ? "data-acme-live"
                : undefined,
          },
        ],
      }).plan(),
    ).rejects.toThrow(/Acme marker/);
  });

  it("treats same-font nesting as one block and rejects conflicting fonts", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Outer <span data-glyphscramble-font="body">Inner</span></article></body></html>',
    );
    const plan = await new StaticBuildPlanner(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
    }).plan();
    expect(plan.protectedBlocks).toBe(1);
    expect(plan.warnings).toHaveLength(1);
    const result = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      seed: "nested-seed",
    });
    expect(result.protectedBlocks).toBe(1);
    const output = await readFile(join(cwd, "published/index.html"), "utf8");
    expect(output).not.toContain("Outer");
    expect(output).not.toContain("Inner");

    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Outer <span data-glyphscramble-font="other">Inner</span></article></body></html>',
    );
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "second",
      }).plan(),
    ).rejects.toThrow(/conflicts with ancestor font/);
  });

  it("rejects overlapping trees and can refuse an existing destination", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    await writeFile(join(cwd, "source/index.html"), "<html></html>");
    expect(
      () =>
        new StaticBuildPlanner(config, {
          cwd,
          inputDir: "source",
          outputDir: "source/protected",
        }),
    ).toThrow(/separate sibling trees/);

    await symlink(join(cwd, "source"), join(cwd, "source-link"));
    await expect(
      new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "source-link/protected",
      }).plan(),
    ).rejects.toThrow(/symlinked paths/);

    await mkdir(join(cwd, "published"));
    await writeFile(join(cwd, "published/sentinel.txt"), "keep me");
    await expect(
      buildStaticSite(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
        existingOutput: "reject",
      }),
    ).rejects.toThrow(/already exists/);
    expect(await readFile(join(cwd, "published/sentinel.txt"), "utf8")).toBe(
      "keep me",
    );
  });
});
