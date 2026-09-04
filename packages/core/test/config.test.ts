import { describe, expect, it } from "vitest";
import { defineGlyphConfig } from "../src/config.js";
import { MAX_TIMER_DELAY_MS } from "../src/limits.js";
import type { GlyphConfig } from "../src/types.js";

function config(runtime: GlyphConfig["runtime"]): GlyphConfig {
  return {
    fonts: {
      body: {
        source: { kind: "file", path: "./body.ttf" },
        license: { spdx: "OFL-1.1", file: "./OFL.txt" },
      },
    },
    rotation: {
      scope: "response",
      secretEnv: "GLYPHSCRAMBLE_SECRET",
      tokenTtlSeconds: 60,
    },
    routePrefix: "/_glyphscramble",
    unsupported: "error",
    accessibilityRiskAcknowledged: true,
    runtime,
  };
}

describe("runtime configuration", () => {
  it("normalizes safe defaults while keeping font licensing and accessibility explicit", () => {
    expect(
      defineGlyphConfig({
        fonts: {
          body: {
            source: { kind: "file", path: "./body.ttf" },
            license: { spdx: "OFL-1.1", file: "./OFL.txt" },
          },
        },
        accessibilityRiskAcknowledged: true,
      }),
    ).toMatchObject({
      rotation: {
        scope: "response",
        keyId: "current",
        secretEnv: "GLYPHSCRAMBLE_SECRET",
        tokenTtlSeconds: 600,
      },
      routePrefix: "/_glyphscramble",
      unsupported: "error",
    });
  });

  it("requires a serialization-safe root-relative route prefix", () => {
    const value = config(undefined);
    for (const routePrefix of [
      "https://example.test/font",
      "/glyph/",
      "/glyph?mode=test",
      "/glyph%2fescape",
      "/glyph\\escape",
    ])
      expect(() =>
        defineGlyphConfig({ ...value, routePrefix } as GlyphConfig),
      ).toThrow(/routePrefix/);
  });

  it("accepts explicit bounded response-pool limits", () => {
    expect(
      defineGlyphConfig(
        config({
          variantMode: "response-pool",
          poolLowWatermark: 2,
          poolHighWatermark: 4,
          generationConcurrency: 2,
          generationQueueLimit: 16,
          generationTimeoutMs: 5_000,
          acquisitionTimeoutMs: 50,
          acquisitionQueueLimit: 128,
          workerRecycleAfter: 256,
          drainTimeoutMs: 30_000,
          cacheMaxBytes: 32 * 1024 * 1024,
        }),
      ),
    ).toBeDefined();
  });

  it("validates static base paths and fail-closed timeouts", () => {
    const value = config(undefined);
    expect(
      defineGlyphConfig({
        ...value,
        static: {
          publicBasePath: "/docs/",
          fontLoadTimeoutMs: 5_000,
          fontFailure: "generic-error",
          errorText: "Protected excerpt unavailable.",
        },
      }),
    ).toBeDefined();
    for (const publicBasePath of [
      "https://example.test/docs",
      "//cdn.example.test/docs",
      "/docs/../private",
      "/docs?build=1",
      "/docs%2fprivate",
      "/docs//nested",
      "/docs with spaces",
    ])
      expect(() =>
        defineGlyphConfig({
          ...value,
          static: { publicBasePath } as GlyphConfig["static"],
        }),
      ).toThrow(/publicBasePath/);

    for (const errorText of ["", "   ", "x".repeat(513)])
      expect(() =>
        defineGlyphConfig({
          ...value,
          static: { errorText },
        }),
      ).toThrow(/errorText.*512 UTF-8 bytes/);
    expect(() =>
      defineGlyphConfig({
        ...value,
        static: { fontLoadTimeoutMs: 0 },
      }),
    ).toThrow(/fontLoadTimeoutMs/);
  });

  it("rejects inverted, zero, and excessive bounds", () => {
    expect(() =>
      defineGlyphConfig(config({ poolLowWatermark: 5, poolHighWatermark: 4 })),
    ).toThrow(/poolLowWatermark/);
    expect(() =>
      defineGlyphConfig(config({ generationQueueLimit: 0 })),
    ).toThrow(/positive integer/);
    expect(() =>
      defineGlyphConfig(config({ cacheMaxBytes: 1024 * 1024 * 1024 + 1 })),
    ).toThrow(/no greater/);
    expect(() =>
      defineGlyphConfig(
        config({ variantMode: "window" } as unknown as GlyphConfig["runtime"]),
      ),
    ).toThrow(/response-pool/);
  });

  it("accepts the platform timer ceiling and rejects larger delays", () => {
    expect(() =>
      defineGlyphConfig(
        config({
          generationTimeoutMs: MAX_TIMER_DELAY_MS,
          acquisitionTimeoutMs: MAX_TIMER_DELAY_MS,
          drainTimeoutMs: MAX_TIMER_DELAY_MS,
        }),
      ),
    ).not.toThrow();
    for (const key of [
      "generationTimeoutMs",
      "acquisitionTimeoutMs",
      "drainTimeoutMs",
    ] as const)
      expect(() =>
        defineGlyphConfig(config({ [key]: MAX_TIMER_DELAY_MS + 1 })),
      ).toThrow(/2147483647/);

    const value = config(undefined);
    expect(() =>
      defineGlyphConfig({
        ...value,
        remote: {
          timeoutMs: MAX_TIMER_DELAY_MS,
          totalTimeoutMs: MAX_TIMER_DELAY_MS,
        },
      }),
    ).not.toThrow();
    expect(() =>
      defineGlyphConfig({
        ...value,
        remote: { timeoutMs: MAX_TIMER_DELAY_MS + 1 },
      }),
    ).toThrow(/2147483647/);
  });

  it("validates bounded token rotation metadata", () => {
    const value = config(undefined);
    expect(
      defineGlyphConfig({
        ...value,
        rotation: {
          ...value.rotation,
          keyId: "2026-09",
          previousKeys: [
            { id: "2026-08", secretEnv: "GLYPHSCRAMBLE_SECRET_PREVIOUS" },
          ],
        },
      }),
    ).toBeDefined();
    expect(() =>
      defineGlyphConfig({
        ...value,
        rotation: { ...value.rotation, tokenTtlSeconds: 86_401 },
      }),
    ).toThrow(/no greater/);
    expect(() =>
      defineGlyphConfig({
        ...value,
        rotation: {
          ...value.rotation,
          keyId: "duplicate",
          previousKeys: [{ id: "duplicate", secretEnv: "GLYPHSCRAMBLE_OLD" }],
        },
      }),
    ).toThrow(/Duplicate/);
  });
});
