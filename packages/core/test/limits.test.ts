import { describe, expect, it } from "vitest";
import {
  MAX_COVERAGE_RANGES,
  MAX_GLYPH_PAYLOAD_BYTES,
  assertCoverageWireBounds,
  assertPayloadWireSize,
} from "../src/limits.js";

describe("shared wire bounds", () => {
  it("accepts the exact coverage boundary and rejects one range beyond it", () => {
    const exact = Array.from(
      { length: MAX_COVERAGE_RANGES },
      (_, index) => `U+${index.toString(16).toUpperCase().padStart(4, "0")}`,
    );
    expect(() =>
      assertCoverageWireBounds(exact, "fixture coverage"),
    ).not.toThrow();
    expect(() =>
      assertCoverageWireBounds([...exact, "U+10FFFF"], "fixture coverage"),
    ).toThrow(/1025 Unicode ranges.*1024.*Subset/i);
  });

  it("applies the same UTF-8 serialized payload ceiling on the server", () => {
    const exact = "x".repeat(MAX_GLYPH_PAYLOAD_BYTES - 2);
    expect(() => assertPayloadWireSize(exact)).not.toThrow();
    expect(() => assertPayloadWireSize(`${exact}x`)).toThrow(/byte limit/);
  });
});
