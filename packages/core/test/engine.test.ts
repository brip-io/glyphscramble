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
  it("rejects a weak runtime secret before generating variants", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET = "too short";
    await expect(createGlyphEngine(config, { cwd })).rejects.toThrow(
      /at least 32/,
    );
  });

  it("rotates responses and serves a private matching font", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(
      {
        ...config,
        runtime: { poolLowWatermark: 2, poolHighWatermark: 2 },
      },
      { cwd },
    );
    engine.beginResponse();
    expect(engine.metrics().leasesIssued).toBe(0);
    const one = engine
      .beginResponse()
      .scramble("Secret Value", { font: "body" });
    const two = engine
      .beginResponse()
      .scramble("Secret Value", { font: "body" });
    expect(one.encodedText).not.toBe("Secret Value");
    expect(one.encodedText).not.toBe(two.encodedText);
    expect(one.fontToken).not.toBe(two.fontToken);
    expect(one.face).toBe("default");
    expect(one.rotation).toEqual({
      scope: "response",
      variantMode: "response-pool",
      reusableAcrossResponses: false,
    });
    expect(JSON.stringify(one)).not.toContain("Secret Value");
    const generationsBeforeRequests = engine.metrics().generations;
    const [response, duplicate] = await Promise.all([
      engine.fontResponse(new Request(`https://example.test${one.fontUrl}`)),
      engine.fontResponse(new Request(`https://example.test${one.fontUrl}`)),
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(response.headers.get("cache-control")).toMatch(/^private/);
    expect(response.headers.get("x-glyphscramble-variant-mode")).toBe(
      "response-pool",
    );
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect((await duplicate.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(engine.metrics()).toMatchObject({
      leasesIssued: 2,
      fontHits: 2,
    });
    expect(engine.metrics().generations).toBe(generationsBeforeRequests);
    await engine.close();
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
    await engine.close();
  });

  it("fails closed when a burst consumes the bounded ready pool", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(
      {
        ...config,
        runtime: { poolLowWatermark: 1, poolHighWatermark: 1 },
      },
      { cwd },
    );
    const first = engine.beginResponse().scramble("Secret", { font: "body" });
    expect(first.encodedText).not.toBe("Secret");
    expect(() =>
      engine.beginResponse().scramble("Another secret", { font: "body" }),
    ).toThrow(/variant is ready/i);
    expect(engine.metrics().poolExhaustions).toBe(1);
    await engine.close();
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
    expect(
      await readFile(
        join(cwd, "protected/_glyphscramble/licenses/body.LICENSE.txt"),
        "utf8",
      ),
    ).toBe("fixture license");
  });

  it("selects named faces and reproduces their CSS descriptors", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "glyphscramble-faces-"));
    await mkdir(join(cwd, "licenses"));
    await writeFile(join(cwd, "licenses/OFL.txt"), "fixture license");
    const config = defineGlyphConfig({
      fonts: {
        body: {
          source: {
            kind: "google-css",
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700",
          },
          license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
          faces: {
            regular: { family: "Inter", weight: 400 },
            bold: { family: "Inter", weight: 700 },
          },
          defaultFace: "regular",
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
    const css = `
      @font-face { font-family: Inter; font-weight: 400; font-style: normal; src: url(https://fonts.gstatic.test/regular.woff2); }
      @font-face { font-family: Inter; font-weight: 700; font-style: italic; src: url(https://fonts.gstatic.test/bold.woff2); }
    `;
    const fetcher = (async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.startsWith("https://fonts.googleapis.com/")
        ? new Response(css, { headers: { "content-type": "text/css" } })
        : new Response(syntheticFont(), {
            headers: { "content-type": "font/ttf" },
          });
    }) as typeof fetch;
    await prepareGlyphFonts(config, { cwd, fetcher });
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(config, { cwd });
    const context = engine.beginResponse();
    const regular = context.scramble("Secret", { font: "body" });
    const bold = context.scramble("Secret", { font: "body", face: "bold" });
    expect(regular.face).toBe("regular");
    expect(regular.css).toContain("font-weight:400");
    expect(bold.face).toBe("bold");
    expect(bold.css).toContain("font-weight:700");
    expect(bold.css).toContain("font-style:italic");
    expect(bold.fontUrl).not.toBe(regular.fontUrl);
    expect(
      await engine.fontResponse(
        new Request(`https://example.test${bold.fontUrl}`),
      ),
    ).toMatchObject({ status: 200 });
    expect(() =>
      context.scramble("Secret", { font: "body", face: "missing" }),
    ).toThrow(/Unknown GlyphScramble face/);
    await engine.close();
  });
});
