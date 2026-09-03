import { describe, expect, it } from "vitest";
import { defineGlyphConfig } from "../src/config.js";
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
          cacheMaxBytes: 32 * 1024 * 1024,
        }),
      ),
    ).toBeDefined();
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
