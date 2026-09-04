import { createHash } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineGlyphConfig } from "../src/config.js";
import { prepareGlyphFonts } from "../src/font-pipeline.js";
import {
  StaticBuildPlanError,
  StaticBuildPlanner,
} from "../src/static-plan.js";
import { buildStaticSite, verifyStaticOutput } from "../src/static-output.js";
import { syntheticFont } from "./fixture.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(errorText?: string) {
  const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-static-scale-"));
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
    ...(errorText === undefined
      ? {}
      : { static: { fontFailure: "generic-error" as const, errorText } }),
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

describe("static compiler scale and diagnostics", () => {
  it("keeps a 10k-sibling scan linear and materializes only relevant paths", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    const ordinary = "<article>Public row</article>".repeat(10_000);
    await writeFile(
      join(cwd, "source/index.html"),
      `<html><head></head><body>${ordinary}<article data-glyphscramble-font="body">Secret Value</article></body></html>`,
    );
    let detectorCalls = 0;
    let protectedPath = "";
    const started = performance.now();
    const plan = await new StaticBuildPlanner(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      hydrationDetectors: [
        {
          name: "instrumented",
          detect(element) {
            detectorCalls++;
            if ("data-glyphscramble-font" in element.attributes)
              protectedPath = element.path;
            return undefined;
          },
        },
      ],
    }).plan();
    const elapsedMs = performance.now() - started;

    expect(plan.protectedBlocks).toBe(1);
    expect(detectorCalls).toBeLessThan(10);
    expect(protectedPath).toContain("article[10001]");
    expect(elapsedMs).toBeLessThan(3_000);
  });

  it("handles a 1k-deep protected tree within a bounded scan budget", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    const depth = 1_000;
    await writeFile(
      join(cwd, "source/deep.html"),
      `<html><head></head><body>${"<div>".repeat(depth)}<span data-glyphscramble-font="body">Secret Value</span>${"</div>".repeat(depth)}</body></html>`,
    );
    let detectorCalls = 0;
    const started = performance.now();
    const plan = await new StaticBuildPlanner(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      hydrationDetectors: [
        {
          name: "instrumented",
          detect() {
            detectorCalls++;
            return undefined;
          },
        },
      ],
    }).plan();

    expect(plan.protectedBlocks).toBe(1);
    expect(detectorCalls).toBeLessThanOrEqual(depth + 4);
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it.each([
    ["non-NFC", "Cafe\u0301", /U\+0065 \(not-nfc\)/],
    ["missing scalar", "Unsupported ∑", /U\+2211 \(nfc\)/],
  ])(
    "fails %s text during planning with repair context",
    async (_name, text, codepoint) => {
      const { cwd, config } = await fixture();
      await mkdir(join(cwd, "source/nested"), { recursive: true });
      await writeFile(
        join(cwd, "source/nested/index.html"),
        `<html><head></head><body><article data-glyphscramble-font="body"><span>${text}</span></article></body></html>`,
      );
      const error = await new StaticBuildPlanner(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
      })
        .plan()
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(StaticBuildPlanError);
      expect(error).toMatchObject({
        file: "nested/index.html",
        path: expect.stringContaining("article[1] > span[1]"),
      });
      expect((error as Error).message).toMatch(codepoint);
      expect((error as Error).message).toMatch(
        /font "body" face ".+".*coverage.*leave this block unprotected/i,
      );
    },
  );

  it("publishes byte-identical mixed sites at serial and bounded concurrency", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source/assets"), { recursive: true });
    await Promise.all([
      ...Array.from({ length: 40 }, (_, index) =>
        writeFile(
          join(cwd, `source/page-${String(index).padStart(2, "0")}.html`),
          index % 2 === 0
            ? `<html><head></head><body><article data-glyphscramble-font="body">Secret Value ${index}</article></body></html>`
            : `<html><head></head><body><article>Public Value ${index}</article></body></html>`,
        ),
      ),
      ...Array.from({ length: 100 }, (_, index) =>
        writeFile(
          join(
            cwd,
            `source/assets/value-${String(index).padStart(3, "0")}.bin`,
          ),
          new Uint8Array([index & 0xff, (index * 7) & 0xff]),
        ),
      ),
    ]);

    await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "serial",
      seed: "scale-deterministic-seed",
      concurrency: 1,
    });
    await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "concurrent",
      seed: "scale-deterministic-seed",
      concurrency: 8,
    });
    expect(await treeBytes(join(cwd, "concurrent"))).toEqual(
      await treeBytes(join(cwd, "serial")),
    );
  });

  it("rechecks source identity before reusing a planned AST", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source"));
    const source = join(cwd, "source/index.html");
    await writeFile(
      source,
      '<html><head></head><body><article data-glyphscramble-font="body">Secret Value</article></body></html>',
    );
    await mkdir(join(cwd, "published"));
    await writeFile(join(cwd, "published/sentinel.txt"), "keep me");
    let changed = false;
    await expect(
      buildStaticSite(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
        hydrationDetectors: [
          {
            name: "source mutation fixture",
            detect() {
              if (!changed) {
                changed = true;
                writeFileSync(
                  source,
                  '<html><head></head><body><article data-glyphscramble-font="body">Changed Value</article></body></html>',
                );
              }
              return undefined;
            },
          },
        ],
      }),
    ).rejects.toThrow(/changed after static planning/);
    expect(await readFile(join(cwd, "published/sentinel.txt"), "utf8")).toBe(
      "keep me",
    );
  });

  it("settles a concurrent staging failure before rollback", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "source/assets"), { recursive: true });
    const asset = join(cwd, "source/assets/disappears.bin");
    await writeFile(asset, "temporary");
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Secret Value</article></body></html>',
    );
    await mkdir(join(cwd, "published"));
    await writeFile(join(cwd, "published/sentinel.txt"), "keep me");
    let removed = false;
    await expect(
      buildStaticSite(config, {
        cwd,
        inputDir: "source",
        outputDir: "published",
        concurrency: 8,
        hydrationDetectors: [
          {
            name: "I/O failure fixture",
            detect() {
              if (!removed) {
                removed = true;
                unlinkSync(asset);
              }
              return undefined;
            },
          },
        ],
      }),
    ).rejects.toThrow(/ENOENT|no such file/i);
    expect(await readFile(join(cwd, "published/sentinel.txt"), "utf8")).toBe(
      "keep me",
    );
    expect((await readdir(cwd)).some((name) => name.includes("stage-"))).toBe(
      false,
    );
  });

  it("localizes and independently verifies failure and protected-text contracts", async () => {
    const failureText = "Cet extrait protégé est indisponible.";
    const { cwd, config } = await fixture(failureText);
    await mkdir(join(cwd, "source"));
    await writeFile(
      join(cwd, "source/index.html"),
      '<html><head></head><body><article data-glyphscramble-font="body">Secret Value</article></body></html>',
    );
    const result = await buildStaticSite(config, {
      cwd,
      inputDir: "source",
      outputDir: "published",
      seed: "localized-failure-seed",
    });
    const output = join(cwd, "published/index.html");
    const html = await readFile(output, "utf8");
    expect(result.manifest.failureText).toBe(failureText);
    expect(html).toContain(failureText);

    await writeFile(
      output,
      html.replace(/(<article[^>]*>)[\s\S]*?(<\/article>)/, "$1Secret Value$2"),
    );
    expect(await verifyStaticOutput(join(cwd, "published"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STATIC-HTML-TEXT" }),
      ]),
    );

    await writeFile(
      output,
      html.replace(failureText, "A changed generic failure."),
    );
    expect(await verifyStaticOutput(join(cwd, "published"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STATIC-HTML-CONTRACT" }),
      ]),
    );
  });
});
