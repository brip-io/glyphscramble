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
  createPermutation,
  createPermutationFromPlan,
  createPermutationPlan,
  encodeText,
  isStructuralCodePoint,
  propertySignature,
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
  });
});
