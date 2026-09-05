import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  unicodePropertyKeys,
  unicodePropertyRanges,
  unicodeSourceDigests,
  unicodeStructuralRanges,
} from "../src/generated/unicode17.js";
import {
  compactEncodeMapping,
  createPermutation,
  createPermutationFromPlan,
  createPermutationPlan,
  encodeText,
  isStructuralCodePoint,
  PERMUTATION_ALGORITHM,
  propertySignature,
  unbiasedIndex,
} from "../src/unicode.js";

describe("Unicode-safe permutation", () => {
  const covered = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789אבגابتकखगกขค",
  ].map((value) => value.codePointAt(0)!);

  it("is deterministic, reversible, and property preserving", () => {
    const first = createPermutation(
      covered,
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "body",
    );
    const second = createPermutation(
      covered,
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "body",
    );
    expect(first.encode).toEqual(second.encode);
    for (const [original, encoded] of first.encode) {
      expect(encoded).not.toBe(original);
      expect(propertySignature(encoded)).toBe(propertySignature(original));
      expect(first.decode.get(encoded)).toBe(original);
    }
  });

  it("reuses precomputed property groups without changing the mapping", () => {
    const seed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const direct = createPermutation(covered, seed, "body");
    const planned = createPermutationFromPlan(
      createPermutationPlan(covered),
      seed,
      "body",
    );
    expect(planned).toEqual(direct);
  });

  it("pins the versioned deterministic permutation vector", () => {
    const permutation = createPermutation(
      [..."ABCDEFGH"].map((value) => value.codePointAt(0)!),
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "vector",
    );
    expect(PERMUTATION_ALGORITHM).toBe(
      "glyphscramble-aes-256-ctr-rejection-v2",
    );
    expect([...permutation.encode]).toEqual([
      [0x41, 0x46],
      [0x42, 0x41],
      [0x43, 0x48],
      [0x44, 0x43],
      [0x45, 0x47],
      [0x46, 0x45],
      [0x47, 0x42],
      [0x48, 0x44],
    ]);
  });

  it("uses rejection sampling instead of modulo reduction", () => {
    const words = [0xffff_ffff, 5];
    expect(unbiasedIndex(() => words.shift()!, 3)).toBe(2);
    expect(words).toEqual([]);
    expect(() => unbiasedIndex(() => 0, 0)).toThrow(/bound/);
  });

  it("compacts encode mappings into explicitly accounted typed storage", () => {
    const permutation = createPermutation(
      covered,
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "compact",
    );
    const compact = compactEncodeMapping(permutation.encode);
    expect(compact.size).toBe(permutation.encode.size);
    expect(compact.byteLength).toBeGreaterThanOrEqual(compact.size * 8);
    expect(compact.byteLength).toBeLessThan(compact.size * 24);
    for (const [original, encoded] of permutation.encode)
      expect(compact.get(original)).toBe(encoded);
    expect(compact.get(0x10ffff)).toBeUndefined();
  });

  it("resolves repeated scalars once per encoding call", () => {
    let lookups = 0;
    const mapping = {
      size: 1,
      byteLength: 8,
      get(codepoint: number) {
        lookups++;
        return codepoint === 0x41 ? 0x42 : undefined;
      },
    };
    expect(encodeText("AAAA", mapping)).toBe("BBBB");
    expect(lookups).toBe(1);
  });

  it("leaves segmentation and bidi controls unchanged", () => {
    for (const cp of [
      0x0a, 0x21, 0x2e, 0x301, 0x200c, 0x200d, 0x202e, 0x2067, 0xfe0f,
    ])
      expect(isStructuralCodePoint(cp)).toBe(true);
    const permutation = createPermutation(
      covered,
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    const input = "Ab\nאב\u200d";
    const output = encodeText(input, permutation);
    expect(output).not.toBe(input);
    expect(output.includes("\n")).toBe(true);
    expect(output.endsWith("\u200d")).toBe(true);
  });

  it("fails closed for unsupported plaintext", () => {
    const permutation = createPermutation(
      [0x41, 0x42],
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    expect(() => encodeText("Z", permutation)).toThrow(
      /No Unicode-safe mapping/,
    );
    expect(() => encodeText("∑", permutation)).toThrow(
      /No Unicode-safe mapping for U\+2211/,
    );
  });

  it("matches the pinned source and generated-file digests", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../../../scripts/unicode-17-sources.json", import.meta.url),
        "utf8",
      ),
    ) as {
      sources: Record<string, { sha256: string }>;
      generated: { sha256: string };
    };
    expect(unicodeSourceDigests).toEqual(
      Object.fromEntries(
        Object.entries(manifest.sources).map(([name, value]) => [
          name,
          value.sha256,
        ]),
      ),
    );
    const generated = await readFile(
      new URL("../src/generated/unicode17.ts", import.meta.url),
    );
    expect(createHash("sha256").update(generated).digest("hex")).toBe(
      manifest.generated.sha256,
    );
  });

  it("exhaustively serves sorted, disjoint generated Unicode tables", () => {
    let previousEnd = -1;
    for (const [start, end] of unicodeStructuralRanges) {
      expect(start).toBeGreaterThan(previousEnd);
      expect(end).toBeGreaterThanOrEqual(start);
      for (let codepoint = start; codepoint <= end; codepoint++) {
        expect(isStructuralCodePoint(codepoint)).toBe(true);
        expect(propertySignature(codepoint)).toBeNull();
      }
      previousEnd = end;
    }

    previousEnd = -1;
    for (const [start, end, key] of unicodePropertyRanges) {
      expect(start).toBeGreaterThan(previousEnd);
      expect(end).toBeGreaterThanOrEqual(start);
      expect(unicodePropertyKeys[key]).toBeTypeOf("string");
      for (let codepoint = start; codepoint <= end; codepoint++) {
        expect(isStructuralCodePoint(codepoint)).toBe(false);
        expect(propertySignature(codepoint)).toBe(unicodePropertyKeys[key]);
      }
      previousEnd = end;
    }

    for (const codepoint of [-1, 0x110000, 1.5, Number.NaN]) {
      expect(isStructuralCodePoint(codepoint)).toBe(false);
      expect(propertySignature(codepoint)).toBeNull();
    }
  }, 15_000);
});
