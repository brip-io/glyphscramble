import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { align4, checksum } from "../src/binary.js";
import {
  buildSfnt,
  parseSfnt,
  woff2DeclaredSize,
  type SfntFont,
} from "../src/sfnt.js";
import { syntheticFont } from "./fixture.js";

function tableOffset(bytes: Uint8Array, wanted: string): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < view.getUint16(4); index++) {
    const base = 12 + index * 16;
    const name = String.fromCharCode(...bytes.subarray(base, base + 4));
    if (name === wanted) return view.getUint32(base + 8);
  }
  throw new Error(`Missing ${wanted} table.`);
}

function woffFrom(font: SfntFont): Uint8Array {
  const tables = [...font.tables].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const directoryEnd = 44 + tables.length * 20;
  const length = tables.reduce(
    (total, [, data]) => total + align4(data.length),
    directoryEnd,
  );
  const totalSfntSize = tables.reduce(
    (total, [, data]) => total + align4(data.length),
    12 + tables.length * 16,
  );
  const output = new Uint8Array(length);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x774f4646);
  view.setUint32(4, font.flavor);
  view.setUint32(8, length);
  view.setUint16(12, tables.length);
  view.setUint32(16, totalSfntSize);
  let offset = directoryEnd;
  tables.forEach(([name, data], index) => {
    const base = 44 + index * 20;
    for (let byte = 0; byte < 4; byte++)
      output[base + byte] = name.charCodeAt(byte);
    view.setUint32(base + 4, offset);
    view.setUint32(base + 8, data.length);
    view.setUint32(base + 12, data.length);
    const checksummed = data.slice();
    if (name === "head") new DataView(checksummed.buffer).setUint32(8, 0);
    view.setUint32(base + 16, checksum(checksummed));
    output.set(data, offset);
    offset += align4(data.length);
  });
  return output;
}

describe("hostile font boundaries", () => {
  it("rejects duplicate tags, overlaps, and unreasonable table counts", () => {
    const duplicate = syntheticFont();
    duplicate.set(duplicate.subarray(12, 16), 28);
    expect(() => parseSfnt(duplicate)).toThrow(/Duplicate|not sorted/);

    const overlap = syntheticFont();
    const overlapView = new DataView(overlap.buffer);
    overlapView.setUint32(28 + 8, overlapView.getUint32(12 + 8));
    expect(() => parseSfnt(overlap)).toThrow(/overlap/);

    const excessive = syntheticFont();
    new DataView(excessive.buffer).setUint16(4, 129);
    expect(() => parseSfnt(excessive)).toThrow(/table count exceeds 128/);
  });

  it("rejects table, head, and whole-font checksum corruption", () => {
    const tableCorruption = syntheticFont();
    tableCorruption[tableOffset(tableCorruption, "name")]! ^= 1;
    expect(() => parseSfnt(tableCorruption)).toThrow(/checksum mismatch/);

    const wholeFontCorruption = syntheticFont();
    wholeFontCorruption[tableOffset(wholeFontCorruption, "head") + 8]! ^= 1;
    expect(() => parseSfnt(wholeFontCorruption)).toThrow(
      /whole-font checksum mismatch/,
    );

    const parsed = parseSfnt(syntheticFont());
    const head = parsed.tables.get("head")!.slice();
    new DataView(head.buffer).setUint32(12, 0);
    const invalidHead = buildSfnt({
      ...parsed,
      tables: new Map([...parsed.tables, ["head", head]]),
    });
    expect(() => parseSfnt(invalidHead)).toThrow(/head table magic/);
  });

  it("rejects a deterministic mutation corpus within the parser ceiling", () => {
    const original = syntheticFont();
    for (let index = 0; index < 64; index++) {
      const mutated = original.slice();
      mutated[index]! ^= 1 << (index % 8);
      const started = performance.now();
      expect(() => parseSfnt(mutated), `mutation at byte ${index}`).toThrow();
      expect(performance.now() - started).toBeLessThan(250);
    }
  });

  it("rejects oversized WOFF and WOFF2 declarations before decoding", () => {
    const woff = woffFrom(parseSfnt(syntheticFont()));
    new DataView(woff.buffer).setUint32(16, 32 * 1024 * 1024);
    expect(() => parseSfnt(woff)).toThrow(/WOFF output exceeds/);

    const overlappingMetadata = woffFrom(parseSfnt(syntheticFont()));
    const overlapView = new DataView(overlappingMetadata.buffer);
    overlapView.setUint32(44 + 8, overlapView.getUint32(44 + 12) - 1);
    overlapView.setUint32(24, overlapView.getUint32(44 + 4));
    overlapView.setUint32(28, 1);
    overlapView.setUint32(32, 1);
    expect(() => parseSfnt(overlappingMetadata)).toThrow(/overlaps/);

    const woff2 = new Uint8Array(48);
    const view = new DataView(woff2.buffer);
    view.setUint32(0, 0x774f4632);
    view.setUint32(4, 0x00010000);
    view.setUint32(8, woff2.length);
    view.setUint16(12, 1);
    view.setUint32(16, 32 * 1024 * 1024);
    expect(() => woff2DeclaredSize(woff2)).toThrow(/WOFF2 output exceeds/);
  });
});
