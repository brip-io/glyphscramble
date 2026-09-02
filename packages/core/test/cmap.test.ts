import { describe, expect, it } from "vitest";
import { checksum } from "../src/binary.js";
import { buildCmap, parseCmap, parseVariationSequences } from "../src/cmap.js";
import { buildSfnt, parseSfnt, remapCmap } from "../src/sfnt.js";
import { syntheticFont } from "./fixture.js";

describe("OpenType cmap patcher", () => {
  it("round trips formats 4, 12, and 14", () => {
    const mapping = new Map([
      [0x41, 3],
      [0x42, 4],
      [0x1f600, 9],
    ]);
    const cmap = buildCmap(mapping, [
      {
        selector: 0xfe0f,
        defaults: new Set([0x1f600]),
        nonDefault: new Map([[0x41, 33]]),
      },
    ]);
    expect(parseCmap(cmap)).toEqual(mapping);
    expect(parseVariationSequences(cmap)).toEqual([
      {
        selector: 0xfe0f,
        defaults: new Set([0x1f600]),
        nonDefault: new Map([[0x41, 33]]),
      },
    ]);
  });

  it("preserves every non-cmap table byte and produces a valid whole-font checksum", () => {
    const original = parseSfnt(syntheticFont());
    const patched = remapCmap(original, new Map([[0x42, 0x41]]));
    for (const [name, bytes] of original.tables) {
      if (name !== "cmap" && name !== "head")
        expect(patched.tables.get(name)).toEqual(bytes);
    }
    const output = buildSfnt(patched);
    expect(checksum(output)).toBe(0xb1b0afba);
    expect(parseCmap(parseSfnt(output).tables.get("cmap")!).get(0x42)).toBe(
      parseCmap(original.tables.get("cmap")!).get(0x41),
    );
  });
});
