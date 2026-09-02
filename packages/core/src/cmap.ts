import { align4 } from "./binary.js";

interface EncodingRecord {
  platform: number;
  encoding: number;
  offset: number;
}

function records(cmap: Uint8Array): EncodingRecord[] {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  if (view.getUint16(0) !== 0) throw new Error("Unsupported cmap version.");
  const count = view.getUint16(2);
  if (4 + count * 8 > cmap.length)
    throw new Error("Truncated cmap encoding records.");
  return Array.from({ length: count }, (_, index) => ({
    platform: view.getUint16(4 + index * 8),
    encoding: view.getUint16(6 + index * 8),
    offset: view.getUint32(8 + index * 8),
  }));
}

function parseFormat4(
  cmap: Uint8Array,
  offset: number,
  output: Map<number, number>,
): void {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const length = view.getUint16(offset + 2);
  const segCount = view.getUint16(offset + 6) / 2;
  if (offset + length > cmap.length || segCount < 1)
    throw new Error("Invalid cmap format 4.");
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const deltas = startCodes + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  for (let segment = 0; segment < segCount; segment++) {
    const end = view.getUint16(endCodes + segment * 2);
    const start = view.getUint16(startCodes + segment * 2);
    const delta = view.getInt16(deltas + segment * 2);
    const rangeOffset = view.getUint16(rangeOffsets + segment * 2);
    if (start === 0xffff && end === 0xffff) continue;
    for (let cp = start; cp <= end; cp++) {
      let glyph: number;
      if (rangeOffset === 0) glyph = (cp + delta) & 0xffff;
      else {
        const glyphOffset =
          rangeOffsets + segment * 2 + rangeOffset + (cp - start) * 2;
        if (glyphOffset + 2 > offset + length)
          throw new Error("Invalid cmap format 4 glyph array.");
        glyph = view.getUint16(glyphOffset);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) output.set(cp, glyph);
    }
  }
}

function parseFormat12(
  cmap: Uint8Array,
  offset: number,
  output: Map<number, number>,
): void {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const length = view.getUint32(offset + 4);
  const count = view.getUint32(offset + 12);
  if (offset + length > cmap.length || offset + 16 + count * 12 > cmap.length)
    throw new Error("Invalid cmap format 12.");
  for (let index = 0; index < count; index++) {
    const base = offset + 16 + index * 12;
    const start = view.getUint32(base);
    const end = view.getUint32(base + 4);
    const glyph = view.getUint32(base + 8);
    if (end < start || end > 0x10ffff)
      throw new Error("Invalid cmap format 12 group.");
    for (let cp = start; cp <= end; cp++) output.set(cp, glyph + cp - start);
  }
}

export function parseCmap(cmap: Uint8Array): Map<number, number> {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const output = new Map<number, number>();
  const seen = new Set<number>();
  for (const record of records(cmap)) {
    if (seen.has(record.offset) || record.offset + 2 > cmap.length) continue;
    seen.add(record.offset);
    const format = view.getUint16(record.offset);
    if (format === 12) parseFormat12(cmap, record.offset, output);
    else if (format === 4) parseFormat4(cmap, record.offset, output);
  }
  return output;
}

export interface VariationSequenceMap {
  selector: number;
  defaults: ReadonlySet<number>;
  nonDefault: ReadonlyMap<number, number>;
}

function uint24(view: DataView, offset: number): number {
  return (
    (view.getUint8(offset) << 16) |
    (view.getUint8(offset + 1) << 8) |
    view.getUint8(offset + 2)
  );
}

function setUint24(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, value >>> 16);
  view.setUint8(offset + 1, value >>> 8);
  view.setUint8(offset + 2, value);
}

export function parseVariationSequences(
  cmap: Uint8Array,
): VariationSequenceMap[] {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const record = records(cmap).find(
    (item) =>
      item.offset + 10 <= cmap.length && view.getUint16(item.offset) === 14,
  );
  if (!record) return [];
  const base = record.offset;
  const length = view.getUint32(base + 2);
  const count = view.getUint32(base + 6);
  if (base + length > cmap.length || 10 + count * 11 > length)
    throw new Error("Invalid cmap format 14.");
  const output: VariationSequenceMap[] = [];
  for (let index = 0; index < count; index++) {
    const recordOffset = base + 10 + index * 11;
    const selector = uint24(view, recordOffset);
    const defaultOffset = view.getUint32(recordOffset + 3);
    const nonDefaultOffset = view.getUint32(recordOffset + 7);
    const defaults = new Set<number>();
    const nonDefault = new Map<number, number>();
    if (defaultOffset) {
      const table = base + defaultOffset;
      const ranges = view.getUint32(table);
      if (table + 4 + ranges * 4 > base + length)
        throw new Error("Invalid format 14 default UVS table.");
      for (let range = 0; range < ranges; range++) {
        const start = uint24(view, table + 4 + range * 4);
        const additional = view.getUint8(table + 7 + range * 4);
        for (let cp = start; cp <= start + additional; cp++) defaults.add(cp);
      }
    }
    if (nonDefaultOffset) {
      const table = base + nonDefaultOffset;
      const mappings = view.getUint32(table);
      if (table + 4 + mappings * 5 > base + length)
        throw new Error("Invalid format 14 non-default UVS table.");
      for (let mapping = 0; mapping < mappings; mapping++) {
        nonDefault.set(
          uint24(view, table + 4 + mapping * 5),
          view.getUint16(table + 7 + mapping * 5),
        );
      }
    }
    output.push({ selector, defaults, nonDefault });
  }
  return output;
}

function format4(mapping: ReadonlyMap<number, number>): Uint8Array {
  const all = [...mapping]
    .filter(([cp]) => cp <= 0xffff && cp !== 0xffff)
    .sort(([a], [b]) => a - b);
  // Format 12 remains authoritative. Keep format 4 below its uint16 length ceiling.
  const entries = all.slice(0, 6_500);
  // One single-codepoint segment per mapping is larger but maximally predictable.
  const segCount = entries.length + 1;
  const glyphCount = entries.length;
  const length = 16 + segCount * 8 + glyphCount * 2;
  if (length > 0xffff)
    throw new Error(
      "BMP cmap exceeds format 4 limit; configure a smaller subset.",
    );
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 4);
  view.setUint16(2, length);
  view.setUint16(4, 0);
  view.setUint16(6, segCount * 2);
  const maxPower = 2 ** Math.floor(Math.log2(segCount));
  view.setUint16(8, maxPower * 2);
  view.setUint16(10, Math.log2(maxPower));
  view.setUint16(12, segCount * 2 - maxPower * 2);
  const endOffset = 14;
  const startOffset = endOffset + segCount * 2 + 2;
  const deltaOffset = startOffset + segCount * 2;
  const rangeOffset = deltaOffset + segCount * 2;
  const glyphOffset = rangeOffset + segCount * 2;
  entries.forEach(([cp, glyph], index) => {
    view.setUint16(endOffset + index * 2, cp);
    view.setUint16(startOffset + index * 2, cp);
    view.setInt16(deltaOffset + index * 2, 0);
    // Address is relative to this rangeOffset word.
    view.setUint16(
      rangeOffset + index * 2,
      glyphOffset + index * 2 - (rangeOffset + index * 2),
    );
    view.setUint16(glyphOffset + index * 2, glyph);
  });
  const sentinel = segCount - 1;
  view.setUint16(endOffset + sentinel * 2, 0xffff);
  view.setUint16(startOffset + sentinel * 2, 0xffff);
  view.setInt16(deltaOffset + sentinel * 2, 1);
  return bytes;
}

function format14(variations: readonly VariationSequenceMap[]): Uint8Array {
  const normalized = [...variations].sort((a, b) => a.selector - b.selector);
  const defaultTables: Uint8Array[] = [];
  const nonDefaultTables: Uint8Array[] = [];
  for (const item of normalized) {
    const values = [...item.defaults].sort((a, b) => a - b);
    const ranges: Array<[number, number]> = [];
    for (const cp of values) {
      const last = ranges.at(-1);
      if (last && cp === last[0] + last[1] + 1 && last[1] < 255) last[1]++;
      else ranges.push([cp, 0]);
    }
    const defaults = new Uint8Array(4 + ranges.length * 4);
    const defaultView = new DataView(defaults.buffer);
    defaultView.setUint32(0, ranges.length);
    ranges.forEach(([start, additional], index) => {
      setUint24(defaultView, 4 + index * 4, start);
      defaultView.setUint8(7 + index * 4, additional);
    });
    defaultTables.push(defaults);
    const mappings = [...item.nonDefault].sort(([a], [b]) => a - b);
    const nonDefaults = new Uint8Array(4 + mappings.length * 5);
    const nonDefaultView = new DataView(nonDefaults.buffer);
    nonDefaultView.setUint32(0, mappings.length);
    mappings.forEach(([cp, glyph], index) => {
      setUint24(nonDefaultView, 4 + index * 5, cp);
      nonDefaultView.setUint16(7 + index * 5, glyph);
    });
    nonDefaultTables.push(nonDefaults);
  }
  const header = 10 + normalized.length * 11;
  const length =
    header +
    defaultTables.reduce((sum, item) => sum + item.length, 0) +
    nonDefaultTables.reduce((sum, item) => sum + item.length, 0);
  const output = new Uint8Array(length);
  const view = new DataView(output.buffer);
  view.setUint16(0, 14);
  view.setUint32(2, length);
  view.setUint32(6, normalized.length);
  let offset = header;
  normalized.forEach((item, index) => {
    const record = 10 + index * 11;
    setUint24(view, record, item.selector);
    if (item.defaults.size) {
      view.setUint32(record + 3, offset);
      output.set(defaultTables[index]!, offset);
      offset += defaultTables[index]!.length;
    }
  });
  normalized.forEach((item, index) => {
    if (!item.nonDefault.size) return;
    view.setUint32(10 + index * 11 + 7, offset);
    output.set(nonDefaultTables[index]!, offset);
    offset += nonDefaultTables[index]!.length;
  });
  return output;
}

function format12(mapping: ReadonlyMap<number, number>): Uint8Array {
  const entries = [...mapping].sort(([a], [b]) => a - b);
  const groups: Array<[number, number, number]> = [];
  for (const [cp, glyph] of entries) {
    const previous = groups.at(-1);
    if (
      previous &&
      cp === previous[1] + 1 &&
      glyph === previous[2] + cp - previous[0]
    )
      previous[1] = cp;
    else groups.push([cp, cp, glyph]);
  }
  const bytes = new Uint8Array(16 + groups.length * 12);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 12);
  view.setUint16(2, 0);
  view.setUint32(4, bytes.length);
  view.setUint32(8, 0);
  view.setUint32(12, groups.length);
  groups.forEach(([start, end, glyph], index) => {
    const offset = 16 + index * 12;
    view.setUint32(offset, start);
    view.setUint32(offset + 4, end);
    view.setUint32(offset + 8, glyph);
  });
  return bytes;
}

/** Builds Unicode BMP and full-repertoire subtables (OpenType formats 4 and 12). */
export function buildCmap(
  mapping: ReadonlyMap<number, number>,
  variations: readonly VariationSequenceMap[] = [],
): Uint8Array {
  const bmp = format4(mapping);
  const full = format12(mapping);
  const variation = variations.length ? format14(variations) : undefined;
  const count = variation ? 4 : 3;
  const headerLength = 4 + count * 8;
  const bmpOffset = headerLength;
  const fullOffset = align4(bmpOffset + bmp.length);
  const variationOffset = align4(fullOffset + full.length);
  const bytes = new Uint8Array(
    variation ? variationOffset + variation.length : fullOffset + full.length,
  );
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0);
  view.setUint16(2, count);
  // Windows Unicode BMP
  view.setUint16(4, 3);
  view.setUint16(6, 1);
  view.setUint32(8, bmpOffset);
  // Windows Unicode full repertoire
  view.setUint16(12, 3);
  view.setUint16(14, 10);
  view.setUint32(16, fullOffset);
  // Unicode full repertoire
  view.setUint16(20, 0);
  view.setUint16(22, 4);
  view.setUint32(24, fullOffset);
  if (variation) {
    view.setUint16(28, 0);
    view.setUint16(30, 5);
    view.setUint32(32, variationOffset);
    bytes.set(variation, variationOffset);
  }
  bytes.set(bmp, bmpOffset);
  bytes.set(full, fullOffset);
  return bytes;
}
