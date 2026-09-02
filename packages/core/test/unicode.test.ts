import { describe, expect, it } from "vitest";
import {
  createPermutation,
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

  it("leaves segmentation and bidi controls unchanged", () => {
    for (const cp of [0x0a, 0x200c, 0x200d, 0x202e, 0x2067, 0xfe0f, 0x0301])
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
  });
});
