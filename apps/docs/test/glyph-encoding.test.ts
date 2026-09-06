import { describe, expect, test } from "vitest";
import {
  demoData,
  passthroughCharacters,
  type DemoFixture,
} from "../lib/demo-fixtures";
import { encodeSample } from "../lib/glyph-encoding";

const fixtures: readonly DemoFixture[] = [
  demoData.runtime.a,
  demoData.runtime.b,
  demoData.static.a,
  demoData.static.b,
];

function encode(text: string, fixture: DemoFixture) {
  return encodeSample(text, fixture.encodeMap, passthroughCharacters);
}

describe("browser-side sample encoding", () => {
  test("reproduces the encoded text each fixture was generated with", () => {
    for (const fixture of fixtures) {
      expect(encode(demoData.sentence, fixture).encodedText).toBe(
        fixture.encodedText,
      );
    }
  });

  test("permutes every mapped character away from itself", () => {
    for (const fixture of fixtures) {
      for (const character of demoData.alphabet.mapped) {
        expect(fixture.encodeMap[character]).toBeDefined();
        expect(fixture.encodeMap[character]).not.toBe(character);
      }
    }
  });

  test("permutes within a Unicode class, so shape is preserved", () => {
    const classes = ["0123456789", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    for (const fixture of fixtures) {
      for (const group of classes) {
        const permuted = [...group].map(
          (character) => fixture.encodeMap[character],
        );
        expect([...permuted].sort().join("")).toBe([...group].sort().join(""));
      }
    }
  });

  test("passes structural characters through untouched", () => {
    const structural = demoData.alphabet.passthrough;
    const { encodedText, unsupported } = encode(structural, demoData.runtime.a);
    expect(encodedText).toBe(structural);
    expect(unsupported).toEqual([]);
  });

  test("reports characters the face cannot encode, once each", () => {
    const { encodedText, unsupported } = encode(
      "cost = $5 + $6",
      demoData.runtime.a,
    );
    expect(unsupported).toEqual(["=", "$", "+"]);
    // Unsupported characters survive verbatim, which is the point of the notice.
    for (const character of unsupported) {
      expect(encodedText).toContain(character);
    }
  });

  test("treats characters outside the prepared coverage as unsupported", () => {
    expect(encode("café", demoData.runtime.a).unsupported).toEqual(["é"]);
  });

  test("normalizes to NFC before encoding, as the engine requires", () => {
    const decomposed = "e\u0301";
    const composed = "\u00e9";
    expect(decomposed).not.toBe(composed);
    const result = encode(decomposed, demoData.runtime.a);
    expect(result.encodedText).toBe(composed);
    expect(result.unsupported).toEqual([composed]);
  });

  test("rotates the mapping between variants of one delivery mode", () => {
    const text = "The quick brown fox jumps over 13 lazy dogs.";
    expect(encode(text, demoData.runtime.a).encodedText).not.toBe(
      encode(text, demoData.runtime.b).encodedText,
    );
    expect(encode(text, demoData.static.a).encodedText).not.toBe(
      encode(text, demoData.static.b).encodedText,
    );
  });

  test("encodes empty input without reporting anything", () => {
    expect(encode("", demoData.runtime.a)).toEqual({
      encodedText: "",
      unsupported: [],
    });
  });
});
