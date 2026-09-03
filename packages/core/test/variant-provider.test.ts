import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { inspectFont } from "../src/font-pipeline.js";
import {
  ResponsePoolVariantProvider,
  VariantCancelledError,
  VariantOverloadError,
  VariantTimeoutError,
  type VariantFace,
  type VariantGenerator,
  type VariantProviderOptions,
} from "../src/variant-provider.js";

const face: VariantFace = {
  id: "body@default",
  namespace: "body@default:fixture",
  sfnt: new Uint8Array([0]),
  codepoints: [0x41, 0x42],
};

const interFixture = createRequire(import.meta.url).resolve(
  "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
);

function options(
  overrides: Partial<VariantProviderOptions> = {},
): VariantProviderOptions {
  return {
    poolLowWatermark: 2,
    poolHighWatermark: 2,
    generationConcurrency: 2,
    generationQueueLimit: 4,
    generationTimeoutMs: 100,
    cacheMaxBytes: 1024,
    ...overrides,
  };
}

const bytesGenerator: VariantGenerator = async (_face, seed) =>
  new TextEncoder().encode(seed);

describe("response variant pool", () => {
  it("leases each prepared mapping once and never crosses response ids", async () => {
    const provider = new ResponsePoolVariantProvider(
      [face],
      options(),
      bytesGenerator,
    );
    await provider.start();
    const first = provider.acquire(Date.now() + 1_000);
    const second = provider.acquire(Date.now() + 1_000);
    expect(first.id).not.toBe(second.id);
    expect(first.seed).not.toBe(second.seed);
    expect(provider.font(first.id, face.id, first.seed)).toBeDefined();
    expect(provider.font(first.id, face.id, second.seed)).toBeUndefined();
    expect(provider.metrics()).toMatchObject({
      leasesIssued: 2,
      fontHits: 1,
      fontMisses: 1,
      activeVariants: 2,
    });
    await provider.close();
  });

  it("expires issued variants and accounts cache bytes", async () => {
    let now = 1_000;
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({ poolLowWatermark: 1, poolHighWatermark: 1 }),
      async () => new Uint8Array(12),
      () => now,
    );
    await provider.start();
    const lease = provider.acquire(1_100);
    expect(provider.metrics().cacheBytes).toBe(12);
    now = 1_101;
    expect(provider.font(lease.id, face.id, lease.seed)).toBeUndefined();
    expect(provider.metrics()).toMatchObject({
      activeVariants: 0,
      cacheBytes: 0,
      expiredVariants: 1,
    });
    await provider.close();
  });

  it("refills automatically when token expiry releases byte capacity", async () => {
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({
        poolLowWatermark: 1,
        poolHighWatermark: 1,
        cacheMaxBytes: 12,
      }),
      async () => new Uint8Array(12),
    );
    await provider.start();
    provider.acquire(Date.now() + 20);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(provider.metrics()).toMatchObject({
      expiredVariants: 1,
      readyVariants: 1,
      activeVariants: 0,
      cacheBytes: 12,
    });
    expect(() => provider.acquire(Date.now() + 1_000)).not.toThrow();
    await provider.close();
  });

  it("fails startup when the byte ceiling cannot retain its low watermark", async () => {
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({ cacheMaxBytes: 15 }),
      async () => new Uint8Array(10),
    );
    await expect(provider.start()).rejects.toThrow(/cacheMaxBytes/);
    expect(provider.metrics().capacityDrops).toBe(1);
    await provider.close();
  });

  it("times out and cancels a stuck generation job", async () => {
    const blocked: VariantGenerator = () =>
      new Promise<Uint8Array>(() => undefined);
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({
        poolLowWatermark: 1,
        poolHighWatermark: 1,
        generationConcurrency: 1,
        generationTimeoutMs: 5,
      }),
      blocked,
    );
    await expect(provider.start()).rejects.toBeInstanceOf(VariantTimeoutError);
    expect(provider.metrics()).toMatchObject({
      generationFailures: 1,
      generationTimeouts: 1,
    });
    await provider.close();
  });

  it("cancels active generation when the provider closes", async () => {
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({
        poolLowWatermark: 1,
        poolHighWatermark: 1,
        generationConcurrency: 1,
        generationTimeoutMs: 1_000,
      }),
      () => new Promise<Uint8Array>(() => undefined),
    );
    const starting = provider.start();
    const rejection = expect(starting).rejects.toBeInstanceOf(
      VariantCancelledError,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    await provider.close();
    await rejection;
    expect(provider.metrics().generationCancellations).toBe(1);
  });

  it("rejects work beyond the configured concurrency and queue bound", async () => {
    const blocked: VariantGenerator = (_face, _seed, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({
        poolLowWatermark: 3,
        poolHighWatermark: 3,
        generationConcurrency: 1,
        generationQueueLimit: 1,
        generationTimeoutMs: 1_000,
      }),
      blocked,
    );
    await expect(provider.start()).rejects.toBeInstanceOf(VariantOverloadError);
    expect(provider.metrics().generationOverloads).toBe(1);
    await provider.close();
  });

  it("keeps the event loop responsive while a real face is compressed", async () => {
    const prepared = await inspectFont(
      new Uint8Array(await readFile(interFixture)),
      "inter",
    );
    const provider = new ResponsePoolVariantProvider(
      [
        {
          id: "inter@default",
          namespace: `inter@default:${prepared.metadata.identity}`,
          sfnt: prepared.sfnt,
          codepoints: prepared.metadata.codepoints,
        },
      ],
      options({
        poolLowWatermark: 1,
        poolHighWatermark: 1,
        generationConcurrency: 1,
        generationTimeoutMs: 5_000,
        cacheMaxBytes: 1024 * 1024,
      }),
    );
    let ticks = 0;
    const interval = setInterval(() => ticks++, 5);
    try {
      await provider.start();
    } finally {
      clearInterval(interval);
    }
    const lease = provider.acquire(Date.now() + 1_000);
    const output = provider.font(lease.id, "inter@default", lease.seed);
    expect(new TextDecoder().decode(output?.subarray(0, 4))).toBe("wOF2");
    expect(ticks).toBeGreaterThan(5);
    await provider.close();
  }, 10_000);
});
