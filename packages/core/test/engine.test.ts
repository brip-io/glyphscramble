import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { defineGlyphConfig } from "../src/config.js";
import { createGlyphEngine, responseHeadersForContext } from "../src/engine.js";
import { GlyphContentError } from "../src/content-error.js";
import { prepareGlyphFonts } from "../src/font-pipeline.js";
import { buildStaticSite } from "../src/static-output.js";
import { syntheticFont } from "./fixture.js";
import { compactEncodeMapping, createPermutation } from "../src/unicode.js";
import type { FontVariantProvider } from "../src/variant-provider.js";

const oldSecret = process.env.GLYPHSCRAMBLE_SECRET;
const oldPreviousSecret = process.env.GLYPHSCRAMBLE_SECRET_PREVIOUS;
afterEach(() => {
  if (oldSecret === undefined) delete process.env.GLYPHSCRAMBLE_SECRET;
  else process.env.GLYPHSCRAMBLE_SECRET = oldSecret;
  if (oldPreviousSecret === undefined)
    delete process.env.GLYPHSCRAMBLE_SECRET_PREVIOUS;
  else process.env.GLYPHSCRAMBLE_SECRET_PREVIOUS = oldPreviousSecret;
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

function tokenFromFontUrl(fontUrl: string): string {
  const token = fontUrl.split("/").at(-2);
  if (!token) throw new Error("Fixture font URL did not contain a token.");
  return token;
}

describe("request engine", () => {
  it("accepts retained mappings from a custom variant provider", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const seed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const variantId = Buffer.alloc(16, 1).toString("base64url");
    let now = 1_000_999;
    let asyncExpiry = 0;
    const mapping = compactEncodeMapping(
      createPermutation(
        [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"].map(
          (value) => value.codePointAt(0)!,
        ),
        seed,
        "custom-provider",
      ).encode,
    );
    let mappingReads = 0;
    const provider: FontVariantProvider = {
      async start() {},
      acquire: () => ({ id: variantId, seed }),
      acquireAsync: async (expiresAt) => {
        asyncExpiry = expiresAt;
        now += 2;
        return { id: variantId, seed };
      },
      mapping: (_lease, faceId) => {
        mappingReads++;
        return faceId === "body@default" ? mapping : undefined;
      },
      font: () => new Uint8Array([1]),
      metrics: () => ({
        variantMode: "response-pool",
        leasesIssued: 1,
        poolExhaustions: 0,
        fontHits: 0,
        fontMisses: 0,
        generations: 0,
        generationFailures: 0,
        generationTimeouts: 0,
        generationCancellations: 0,
        generationOverloads: 0,
        acquisitionWaits: 0,
        acquisitionTimeouts: 0,
        acquisitionCancellations: 0,
        expiredVariants: 0,
        capacityDrops: 0,
        readyVariants: 0,
        activeVariants: 1,
        cacheBytes: mapping.byteLength + 1,
        queueDepth: 0,
        activeGenerators: 0,
        waitingRequests: 0,
        draining: false,
        workerRestarts: 0,
        estimatedVariantBytes: mapping.byteLength + 1,
        generationMilliseconds: {
          count: 0,
          total: 0,
          max: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          samples: [],
        },
      }),
      capacityReport: (tokenTtlSeconds, targetResponsesPerSecond) => ({
        faceCount: 1,
        hostParallelism: 1,
        generationConcurrency: 1,
        readyBurst: 1,
        cacheMaxBytes: 1024,
        estimatedVariantBytes: mapping.byteLength + 1,
        cacheLimitedResponses: 1,
        tokenTtlSeconds,
        measuredFaceGenerationP95Ms: 1,
        sustainableResponsesPerSecond: 1,
        sustainableResponsesPerTtl: tokenTtlSeconds,
        estimatedBytesAtSustainableRate: mapping.byteLength + 1,
        ...(targetResponsesPerSecond === undefined
          ? {}
          : {
              targetResponsesPerSecond,
              targetFitsGeneration: true,
              targetFitsCache: true,
            }),
        guidance: [],
      }),
      async drain() {},
      async close() {},
    };
    const engine = await createGlyphEngine(config, {
      cwd,
      variantProvider: provider,
      now: () => now,
    });
    const result = engine.beginResponse().scramble("Secret", { font: "body" });
    expect(result.encodedText).not.toBe("Secret");
    expect(mappingReads).toBe(1);
    const asyncResult = await engine
      .beginResponse()
      .scrambleAsync("Secret", { font: "body" });
    expect(asyncResult.encodedText).not.toBe("Secret");
    expect(asyncExpiry).toBeGreaterThanOrEqual(asyncResult.expiresAt * 1_000);
    expect(engine.capacityReport(1)).toMatchObject({
      targetResponsesPerSecond: 1,
    });
    await engine.drain();
    await engine.close();
  });

  it("rejects a weak runtime secret before generating variants", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET = "too short";
    await expect(createGlyphEngine(config, { cwd })).rejects.toThrow(
      /at least 32/,
    );
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    delete process.env.GLYPHSCRAMBLE_SECRET_PREVIOUS;
    await expect(
      createGlyphEngine(
        {
          ...config,
          rotation: {
            ...config.rotation,
            previousKeys: [
              {
                id: "previous",
                secretEnv: "GLYPHSCRAMBLE_SECRET_PREVIOUS",
              },
            ],
          },
        },
        { cwd },
      ),
    ).rejects.toThrow(/Missing GLYPHSCRAMBLE_SECRET_PREVIOUS/);
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
    expect(tokenFromFontUrl(one.fontUrl)).not.toBe(
      tokenFromFontUrl(two.fontUrl),
    );
    expect(one.face.id).toBe("default");
    expect(one.version).toBe(3);
    expect("fontToken" in one).toBe(false);
    expect("rotation" in one).toBe(false);
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

  it("tracks actual use and preserves cache headers for unprotected responses", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(config, { cwd });
    const context = engine.beginResponse();
    expect(context.used).toBe(false);
    expect(context.usage()).toEqual({
      used: false,
      authorizedFaces: [],
      usedFaces: [],
    });
    expect(
      responseHeadersForContext(context, {
        "cache-control": "public, max-age=3600",
      }).get("cache-control"),
    ).toBe("public, max-age=3600");

    context.scramble("Secret", { font: "body" });
    expect(context.used).toBe(true);
    expect(context.usage()).toMatchObject({
      used: true,
      authorizedFaces: ["body@default"],
      usedFaces: ["body@default"],
      variantId: expect.any(String),
    });
    const protectedHeaders = responseHeadersForContext(context, {
      "cache-control": "public, max-age=3600",
    });
    expect(protectedHeaders.get("cache-control")).toBe("private, no-store");
    expect(protectedHeaders.get("x-glyphscramble")).toBe("response-rotated");
    await engine.close();
  });

  it("returns controlled method/path errors and serves HEAD from prepared bytes", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    let now = 1_000_000;
    const engine = await createGlyphEngine(config, { cwd, now: () => now });
    const value = engine.beginResponse().scramble("Secret", { font: "body" });
    expect(
      await engine.fontResponse(
        new Request(`https://example.test${value.fontUrl}`, { method: "POST" }),
      ),
    ).toMatchObject({ status: 405 });
    expect(
      await engine.fontResponse(
        new Request(
          "https://example.test/_glyphscramble/font/%E0%A4%A/body%40default.woff2",
        ),
      ),
    ).toMatchObject({ status: 400 });

    const generations = engine.metrics().generations;
    const head = await engine.fontResponse(
      new Request(`https://example.test${value.fontUrl}`, { method: "HEAD" }),
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toMatch(/^[1-9]\d*$/);
    expect(head.headers.get("cache-control")).toBe(
      "private, max-age=600, immutable",
    );
    expect(await head.text()).toBe("");
    expect(engine.metrics().generations).toBe(generations);
    now += 600_000;
    expect(
      await engine.fontResponse(
        new Request(`https://example.test${value.fontUrl}`),
      ),
    ).toMatchObject({ status: 401 });
    await engine.close();
  });

  it("rejects tampered font tokens", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(config, { cwd });
    const value = engine.beginResponse().scramble("Secret", { font: "body" });
    const token = tokenFromFontUrl(value.fontUrl);
    const middle = Math.floor(token.length / 2);
    const replacement = token[middle] === "A" ? "B" : "A";
    const tampered =
      token.slice(0, middle) + replacement + token.slice(middle + 1);
    const response = await engine.fontResponse(
      new Request(
        `https://example.test${value.fontUrl.replace(token, tampered)}`,
      ),
    );
    expect(response.status).toBe(401);
    await engine.close();
  });

  it("rejects or explicitly omits unsupported blocks before leasing capacity", async () => {
    const { cwd, config } = await fixture();
    process.env.GLYPHSCRAMBLE_SECRET =
      "test secret with more than thirty two characters";
    const engine = await createGlyphEngine(config, { cwd });
    const context = engine.beginResponse();
    const leasesBefore = engine.metrics().leasesIssued;
    const plaintext = "TOP SECRET €";

    const omitted = context.protect(plaintext, {
      font: "body",
      unsupported: "omit",
    });
    expect(omitted).toMatchObject({
      status: "omitted",
      error: {
        code: "GLYPH_CONTENT_UNSUPPORTED",
        codepoint: "U+20AC",
        normalization: "nfc",
        font: "body",
        face: "default",
      },
    });
    expect(JSON.stringify(omitted)).not.toContain(plaintext);
    expect(context.used).toBe(false);
    expect("token" in context).toBe(false);
    expect(engine.metrics().leasesIssued).toBe(leasesBefore);

    let requiredFailure: unknown;
    try {
      context.scramble(plaintext, { font: "body" });
    } catch (error) {
      requiredFailure = error;
    }
    expect(requiredFailure).toBeInstanceOf(GlyphContentError);
    expect((requiredFailure as Error).message).toMatch(
      /U\+20AC.*body\.default.*normalize.*coverage/i,
    );
    expect((requiredFailure as Error).message).not.toContain(plaintext);
    const nonNfc = await context.protectAsync("e\u0301", {
      font: "body",
      unsupported: "omit",
    });
    expect(nonNfc).toMatchObject({
      status: "omitted",
      error: { normalization: "not-nfc", font: "body", face: "default" },
    });
    expect(engine.metrics().leasesIssued).toBe(leasesBefore);

    const protectedBlock = context.protect("Secret", {
      font: "body",
      unsupported: "omit",
    });
    expect(protectedBlock.status).toBe("protected");
    expect(context.used).toBe(true);
    await engine.close();
  });

  it("validates the complete client wire contract before marking a response used", async () => {
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
    const context = engine.beginResponse();
    expect(() =>
      context.scramble("Secret", {
        font: "body",
        lang: "x".repeat(65),
      }),
    ).toThrow(/payload\.lang/);
    expect(context.used).toBe(false);
    expect(context.usage()).toMatchObject({
      authorizedFaces: [],
      usedFaces: [],
    });
    expect(engine.metrics().leasesIssued).toBe(0);

    expect(() =>
      context.scramble("Secret", {
        font: "body",
        cspNonce: "invalid nonce with spaces",
      }),
    ).toThrow(/payload\.cspNonce/);
    expect(context.used).toBe(false);
    expect(engine.metrics().leasesIssued).toBe(0);
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
    expect(html).toContain(
      `/_glyphscramble/${result.manifest.buildId}/static.`,
    );
    const notice = result.manifest.assets.find(
      (asset) => asset.kind === "license",
    );
    expect(notice).toBeDefined();
    expect(await readFile(join(cwd, "protected", notice!.path), "utf8")).toBe(
      "fixture license",
    );
  });

  it("selects named faces and emits their validated descriptors", async () => {
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
        heading: {
          source: {
            kind: "google-css",
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700",
          },
          license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
          faces: { regular: { family: "Inter", weight: 400 } },
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
    const regular = context.scramble("Secret", { font: "body", lang: "en" });
    const missesBeforePreparedFace = engine.metrics().fontMisses;
    expect(
      await engine.fontResponse(
        new Request(
          `https://example.test${regular.fontUrl.replace("body%40regular.woff2", "body%40bold.woff2")}`,
        ),
      ),
    ).toMatchObject({ status: 200 });
    expect(engine.metrics().fontMisses).toBe(missesBeforePreparedFace);
    const bold = context.scramble("Secret", { font: "body", face: "bold" });
    const regularAgain = context.scramble("Secret", {
      font: "body",
      face: "regular",
    });
    const heading = context.scramble("Secret", { font: "heading" });
    expect(regular.version).toBe(3);
    expect(regular.face).toMatchObject({
      id: "regular",
      weight: "400",
      style: "normal",
    });
    expect(regular.lang).toBe("en");
    expect(regular.coverage).toMatch(/^[a-f0-9]{64}$/);
    expect("css" in regular).toBe(false);
    expect("family" in regular).toBe(false);
    expect(bold.face).toMatchObject({
      id: "bold",
      weight: "700",
      style: "italic",
    });
    expect(bold.fontUrl).not.toBe(regular.fontUrl);
    expect(tokenFromFontUrl(bold.fontUrl)).toBe(
      tokenFromFontUrl(regular.fontUrl),
    );
    expect(tokenFromFontUrl(heading.fontUrl)).toBe(
      tokenFromFontUrl(regular.fontUrl),
    );
    expect(regularAgain.fontUrl).toBe(regular.fontUrl);
    expect(context.usage()).toMatchObject({
      authorizedFaces: ["body@bold", "body@regular", "heading@regular"],
      usedFaces: ["body@bold", "body@regular", "heading@regular"],
    });
    expect(
      await engine.fontResponse(
        new Request(`https://example.test${bold.fontUrl}`),
      ),
    ).toMatchObject({ status: 200 });
    expect(() =>
      context.scramble("Secret", { font: "body", face: "missing" }),
    ).toThrow(/Unknown GlyphScramble face/);

    const narrowed = engine.beginResponse({
      faces: [{ font: "body", face: "regular" }],
    });
    const narrowedRegular = narrowed.scramble("Secret", { font: "body" });
    const leasesBeforeUndeclared = engine.metrics().leasesIssued;
    expect(() =>
      narrowed.scramble("Secret", { font: "body", face: "bold" }),
    ).toThrow(/not predeclared/);
    expect(engine.metrics().leasesIssued).toBe(leasesBeforeUndeclared);
    expect(
      await engine.fontResponse(
        new Request(
          `https://example.test${narrowedRegular.fontUrl.replace("body%40regular.woff2", "body%40bold.woff2")}`,
        ),
      ),
    ).toMatchObject({ status: 403 });

    const token = tokenFromFontUrl(regular.fontUrl);
    const legacyPayload = {
      ...regular,
      version: 2,
      fontToken: token,
      coverage: {
        identity: regular.coverage,
        ranges: regular.face.unicodeRange,
      },
      rotation: {
        scope: "response",
        variantMode: "response-pool",
        reusableAcrossResponses: false,
      },
    };
    const blocks = 20;
    const compactBytes = Buffer.byteLength(
      JSON.stringify(Array.from({ length: blocks }, () => regular)),
    );
    const legacyBytes = Buffer.byteLength(
      JSON.stringify(Array.from({ length: blocks }, () => legacyPayload)),
    );
    expect(compactBytes).toBeLessThan(legacyBytes * 0.75);
    await engine.close();
  });
});
