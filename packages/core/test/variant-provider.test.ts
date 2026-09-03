import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { inspectFont } from "../src/font-pipeline.js";
import { parseCmap } from "../src/cmap.js";
import { buildSfnt, parseSfnt, remapCmap } from "../src/sfnt.js";
import {
  createPermutationPlan,
  encodeText,
  type Permutation,
} from "../src/unicode.js";
import {
  ResponsePoolVariantProvider,
  VariantCancelledError,
  VariantOverloadError,
  VariantTimeoutError,
  type VariantFace,
  type VariantGenerator,
  type VariantProviderOptions,
} from "../src/variant-provider.js";
import { syntheticFont } from "./fixture.js";

const face: VariantFace = {
  id: "body@default",
  namespace: "body@default:fixture",
  sfnt: new Uint8Array([0]),
  permutationPlan: createPermutationPlan([0x41, 0x42]),
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
    const mappingBytes = provider.mapping(lease, face.id)!.byteLength;
    expect(provider.metrics().cacheBytes).toBe(12 + mappingBytes);
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
        cacheMaxBytes: 12 + 32,
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
      cacheBytes: 12 + 32,
    });
    expect(() => provider.acquire(Date.now() + 1_000)).not.toThrow();
    await provider.close();
  });

  it("never starts refill generation inline with lease acquisition", async () => {
    let generations = 0;
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({ poolLowWatermark: 1, poolHighWatermark: 1 }),
      async () => {
        generations++;
        return new Uint8Array(12);
      },
    );
    await provider.start();
    expect(generations).toBe(1);
    provider.acquire(Date.now() + 1_000);
    expect(generations).toBe(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(generations).toBe(2);
    await provider.close();
  });

  it("fails startup when the byte ceiling cannot retain its low watermark", async () => {
    const provider = new ResponsePoolVariantProvider(
      [face],
      options({ cacheMaxBytes: 42 }),
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
          permutationPlan: createPermutationPlan(prepared.metadata.codepoints),
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

  it("retains the exact generated mapping for every face and releases it on expiry", async () => {
    let now = 1_000;
    const source = syntheticFont();
    const originalCmap = parseCmap(parseSfnt(source).tables.get("cmap")!);
    const faces: VariantFace[] = [
      {
        id: "body@latin",
        namespace: "body@latin:fixture",
        sfnt: source,
        permutationPlan: createPermutationPlan(
          [..."ABCD"].map((value) => value.codePointAt(0)!),
        ),
      },
      {
        id: "body@hebrew",
        namespace: "body@hebrew:fixture",
        sfnt: source,
        permutationPlan: createPermutationPlan(
          [..."אבג"].map((value) => value.codePointAt(0)!),
        ),
      },
    ];
    const generated = new Map<string, Permutation>();
    const provider = new ResponsePoolVariantProvider(
      faces,
      options({
        poolLowWatermark: 1,
        poolHighWatermark: 1,
        cacheMaxBytes: source.length * 3,
      }),
      async (generatedFace, seed, _signal, permutation) => {
        generated.set(`${seed}:${generatedFace.id}`, permutation);
        return buildSfnt(
          remapCmap(parseSfnt(generatedFace.sfnt), permutation.decode),
        );
      },
      () => now,
    );
    await provider.start();
    const lease = provider.acquire(1_100);

    for (const generatedFace of faces) {
      const permutation = generated.get(`${lease.seed}:${generatedFace.id}`)!;
      const retained = provider.mapping(lease, generatedFace.id)!;
      const output = provider.font(lease.id, generatedFace.id, lease.seed)!;
      const outputCmap = parseCmap(parseSfnt(output).tables.get("cmap")!);
      expect(retained.byteLength).toBeGreaterThanOrEqual(retained.size * 8);
      expect(retained.byteLength).toBeLessThan(retained.size * 24);
      for (const [original, encoded] of permutation.encode) {
        expect(retained.get(original)).toBe(encoded);
        expect(outputCmap.get(encoded)).toBe(originalCmap.get(original));
      }
      const sample = generatedFace.id === "body@latin" ? "ABCD" : "אבג";
      expect(encodeText(sample, retained)).toBe(
        encodeText(sample, permutation),
      );
    }

    now = 1_101;
    expect(provider.mapping(lease, "body@latin")).toBeUndefined();
    expect(provider.mapping(lease, "body@hebrew")).toBeUndefined();
    expect(provider.metrics()).toMatchObject({
      activeVariants: 0,
      cacheBytes: 0,
      expiredVariants: 1,
    });
    await provider.close();
  });
});
