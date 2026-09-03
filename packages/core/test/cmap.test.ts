import { describe, expect, it } from "vitest";
import { checksum } from "../src/binary.js";
import { buildCmap, parseCmap, parseVariationSequences } from "../src/cmap.js";
import { buildSfnt, parseSfnt, remapCmap } from "../src/sfnt.js";
import { syntheticFont } from "./fixture.js";

function extractSubtable(
  bytes: Uint8Array,
  platform: number,
  encoding: number,
): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < view.getUint16(2); index++) {
    const record = 4 + index * 8;
    if (
      view.getUint16(record) === platform &&
      view.getUint16(record + 2) === encoding
    ) {
      const offset = view.getUint32(record + 4);
      const format = view.getUint16(offset);
      const length =
        format === 4 ? view.getUint16(offset + 2) : view.getUint32(offset + 4);
      return bytes.slice(offset, offset + length);
    }
  }
  throw new Error("Missing test cmap subtable.");
}

function wrapWindowsBmp(subtable: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + subtable.length);
  const view = new DataView(output.buffer);
  view.setUint16(2, 1);
  view.setUint16(4, 3);
  view.setUint16(6, 1);
  view.setUint32(8, 12);
  output.set(subtable, 12);
  return output;
}

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

  it("selects the Windows full-repertoire subtable independent of record order", () => {
    const unicode = buildCmap(new Map([[0x41, 3]]));
    const windows = buildCmap(new Map([[0x41, 9]]));
    const format4 = extractSubtable(unicode, 3, 1);
    const format12 = extractSubtable(windows, 3, 10);
    const format4Offset = 20;
    const format12Offset = format4Offset + format4.length;
    const combined = new Uint8Array(format12Offset + format12.length);
    const view = new DataView(combined.buffer);
    view.setUint16(2, 2);
    view.setUint16(4, 0);
    view.setUint16(6, 4);
    view.setUint32(8, format4Offset);
    view.setUint16(12, 3);
    view.setUint16(14, 10);
    view.setUint32(16, format12Offset);
    combined.set(format4, format4Offset);
    combined.set(format12, format12Offset);

    expect(parseCmap(combined).get(0x41)).toBe(9);
  });

  it("rejects malformed records and scalar ranges before expansion", () => {
    const duplicate = buildCmap(new Map([[0x41, 3]]));
    const duplicateView = new DataView(duplicate.buffer);
    duplicateView.setUint16(12, 0);
    duplicateView.setUint16(14, 4);
    expect(() => parseCmap(duplicate)).toThrow(/uniquely sorted/);

    const excessiveRecords = new Uint8Array(4);
    new DataView(excessiveRecords.buffer).setUint16(2, 65);
    expect(() => parseCmap(excessiveRecords)).toThrow(
      /record count exceeds 64/,
    );

    const excessiveGroups = new Uint8Array(12 + 16);
    const excessiveGroupsView = new DataView(excessiveGroups.buffer);
    excessiveGroupsView.setUint16(2, 1);
    excessiveGroupsView.setUint16(4, 3);
    excessiveGroupsView.setUint16(6, 10);
    excessiveGroupsView.setUint32(8, 12);
    excessiveGroupsView.setUint16(12, 12);
    excessiveGroupsView.setUint32(16, 16);
    excessiveGroupsView.setUint32(24, 100_001);
    expect(() => parseCmap(excessiveGroups)).toThrow(/format 12/);

    const crossing = new Uint8Array(20 + 28);
    const crossingView = new DataView(crossing.buffer);
    crossingView.setUint16(2, 2);
    crossingView.setUint16(4, 0);
    crossingView.setUint16(6, 4);
    crossingView.setUint32(8, 20);
    crossingView.setUint16(12, 3);
    crossingView.setUint16(14, 10);
    crossingView.setUint32(16, 20);
    crossingView.setUint16(20, 12);
    crossingView.setUint32(24, 28);
    crossingView.setUint32(32, 1);
    crossingView.setUint32(36, 0xd7ff);
    crossingView.setUint32(40, 0xe000);
    crossingView.setUint32(44, 1);
    expect(() => parseCmap(crossing)).toThrow(/format 12 group/);
  });

  it("compacts contiguous BMP mappings into format 4 segments", () => {
    const mapping = new Map<number, number>();
    for (let index = 0; index < 7_000; index++)
      mapping.set(0x20 + index, ((index * 37) % 8_000) + 1);
    const cmap = buildCmap(mapping);
    const compact = extractSubtable(cmap, 3, 1);
    const view = new DataView(compact.buffer);
    expect(view.getUint16(6) / 2).toBe(2);
    expect(compact.length).toBe(14_032);
    expect(parseCmap(wrapWindowsBmp(compact))).toEqual(mapping);
    expect(parseCmap(cmap)).toEqual(mapping);
  });

  it("uses a delta segment when a contiguous BMP run has one offset", () => {
    const mapping = new Map<number, number>();
    for (let codepoint = 0; codepoint < 7_000; codepoint++)
      mapping.set(codepoint, codepoint + 1);
    const compact = extractSubtable(buildCmap(mapping), 3, 1);
    expect(compact.length).toBe(32);
    expect(parseCmap(wrapWindowsBmp(compact))).toEqual(mapping);
  });

  it("keeps format 4 only when the complete compact table fits", () => {
    const mapping = new Map<number, number>();
    for (let index = 0; index < 32_751; index++)
      mapping.set(index, ((index * 37) % 40_000) + 1);
    const fitting = buildCmap(mapping);
    expect(extractSubtable(fitting, 3, 1).length).toBe(65_534);

    mapping.set(32_751, 1);
    const overflowing = buildCmap(mapping);
    expect(new DataView(overflowing.buffer).getUint16(2)).toBe(2);
    expect(parseCmap(overflowing)).toEqual(mapping);
  });
});
