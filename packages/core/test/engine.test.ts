import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { defineGlyphConfig } from "../src/config.js";
import { createGlyphEngine } from "../src/engine.js";
import { prepareGlyphFonts } from "../src/font-pipeline.js";
import { buildStaticSite } from "../src/static-site.js";
import { syntheticFont } from "./fixture.js";

const oldSecret = process.env.GLYPHSCRAMBLE_SECRET;
afterEach(() => {
  if (oldSecret === undefined) delete process.env.GLYPHSCRAMBLE_SECRET;
  else process.env.GLYPHSCRAMBLE_SECRET = oldSecret;
});

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-"));
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

describe("request engine", () => {
  it("rotates responses and serves a private matching font", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(config, { cwd });
    const one = engine
      .beginResponse()
      .scramble("Secret Value", { font: "body" });
    const two = engine
      .beginResponse()
      .scramble("Secret Value", { font: "body" });
    expect(one.encodedText).not.toBe("Secret Value");
    expect(one.encodedText).not.toBe(two.encodedText);
    expect(one.fontToken).not.toBe(two.fontToken);
    expect(JSON.stringify(one)).not.toContain("Secret Value");
    const response = await engine.fontResponse(
      new Request(`https://example.test${one.fontUrl}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(response.headers.get("cache-control")).toMatch(/^private/);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("rejects tampered font tokens", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(config, { cwd });
    const value = engine.beginResponse().scramble("Secret", { font: "body" });
    const response = await engine.fontResponse(
      new Request(`https://example.test${value.fontUrl}x`),
    );
    expect(response.status).toBe(404);
  });

  it("post-processes explicitly marked static blocks without plaintext", async () => {
    const { cwd, config } = await fixture();
    await mkdir(join(cwd, "public"));
    await writeFile(
      join(cwd, "public/index.html"),
      '<!doctype html><html><head><title>Public title</title></head><body><p data-glyphscramble-font="body">Secret Value</p><p>Indexable copy</p></body></html>',
    );
    const result = await buildStaticSite(config, {
      cwd,
      inputDir: "public",
      outputDir: "protected",
    });
    const html = await readFile(join(cwd, "protected/index.html"), "utf8");
    expect(result.protectedBlocks).toBe(1);
    expect(html).not.toContain("Secret Value");
    expect(html).toContain("Indexable copy");
    expect(html).toContain("/_glyphscramble/static.css");
  });
});
