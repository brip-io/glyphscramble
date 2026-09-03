import { align4 } from "./binary.js";

interface EncodingRecord {
  platform: number;
  encoding: number;
  offset: number;
}

const MAX_CMAP_RECORDS = 64;
const MAX_FORMAT12_GROUPS = 100_000;
const MAX_DECODED_MAPPINGS = 250_000;

function isUnicodeScalar(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
  );
}

function crossesSurrogateRange(start: number, end: number): boolean {
  return start <= 0xdfff && end >= 0xd800;
}

function records(cmap: Uint8Array): EncodingRecord[] {
  if (cmap.length < 4) throw new Error("Truncated cmap header.");
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  if (view.getUint16(0) !== 0) throw new Error("Unsupported cmap version.");
  const count = view.getUint16(2);
  if (count < 1 || count > MAX_CMAP_RECORDS)
    throw new Error(`cmap encoding record count exceeds ${MAX_CMAP_RECORDS}.`);
  if (4 + count * 8 > cmap.length)
    throw new Error("Truncated cmap encoding records.");
  const output: EncodingRecord[] = [];
  let previousPlatform = -1;
  let previousEncoding = -1;
  for (let index = 0; index < count; index++) {
    const platform = view.getUint16(4 + index * 8);
    const encoding = view.getUint16(6 + index * 8);
    const offset = view.getUint32(8 + index * 8);
    if (
      platform < previousPlatform ||
      (platform === previousPlatform && encoding <= previousEncoding)
    )
      throw new Error("cmap encoding records are not uniquely sorted.");
    if (offset < 4 + count * 8 || offset + 2 > cmap.length)
      throw new Error("Invalid cmap subtable offset.");
    previousPlatform = platform;
    previousEncoding = encoding;
    output.push({ platform, encoding, offset });
  }
  return output;
}

function parseFormat4(
  cmap: Uint8Array,
  offset: number,
  output: Map<number, number>,
): void {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  if (offset + 16 > cmap.length) throw new Error("Invalid cmap format 4.");
  const length = view.getUint16(offset + 2);
  const segCountX2 = view.getUint16(offset + 6);
  const segCount = segCountX2 / 2;
  if (
    length < 16 ||
    offset + length > cmap.length ||
    segCountX2 % 2 !== 0 ||
    segCount < 1
  )
    throw new Error("Invalid cmap format 4.");
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const deltas = startCodes + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  if (rangeOffsets + segCount * 2 > offset + length)
    throw new Error("Invalid cmap format 4 arrays.");
  let previousEnd = -1;
  for (let segment = 0; segment < segCount; segment++) {
    const end = view.getUint16(endCodes + segment * 2);
    const start = view.getUint16(startCodes + segment * 2);
    const delta = view.getInt16(deltas + segment * 2);
    const rangeOffset = view.getUint16(rangeOffsets + segment * 2);
    if (
      start > end ||
      start <= previousEnd ||
      crossesSurrogateRange(start, end)
    )
      throw new Error("Invalid cmap format 4 segment ordering.");
    previousEnd = end;
    if (segment === segCount - 1 && (start !== 0xffff || end !== 0xffff))
      throw new Error("cmap format 4 is missing its sentinel segment.");
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
      if (glyph !== 0) {
        output.set(cp, glyph);
        if (output.size > MAX_DECODED_MAPPINGS)
          throw new Error(`cmap mappings exceed ${MAX_DECODED_MAPPINGS}.`);
      }
    }
  }
}

function parseFormat12(
  cmap: Uint8Array,
  offset: number,
  output: Map<number, number>,
): void {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  if (offset + 16 > cmap.length) throw new Error("Invalid cmap format 12.");
  const length = view.getUint32(offset + 4);
  const count = view.getUint32(offset + 12);
  if (
    view.getUint16(offset + 2) !== 0 ||
    length < 16 ||
    offset + length > cmap.length ||
    count > MAX_FORMAT12_GROUPS ||
    count > Math.floor((length - 16) / 12)
  )
    throw new Error("Invalid cmap format 12.");
  let previousEnd = -1;
  for (let index = 0; index < count; index++) {
    const base = offset + 16 + index * 12;
    const start = view.getUint32(base);
    const end = view.getUint32(base + 4);
    const glyph = view.getUint32(base + 8);
    if (
      !isUnicodeScalar(start) ||
      !isUnicodeScalar(end) ||
      crossesSurrogateRange(start, end) ||
      end < start ||
      start <= previousEnd ||
      glyph > 0xffff ||
      glyph + end - start > 0xffff ||
      output.size + end - start + 1 > MAX_DECODED_MAPPINGS
    )
      throw new Error("Invalid cmap format 12 group.");
    previousEnd = end;
    for (let cp = start; cp <= end; cp++) output.set(cp, glyph + cp - start);
  }
}

function cmapPriority(record: EncodingRecord, format: number): number | null {
  if (format === 12 && record.platform === 3 && record.encoding === 10)
    return 0;
  if (format === 12 && record.platform === 0 && record.encoding !== 5) return 1;
  if (format === 4 && record.platform === 3 && record.encoding === 1) return 2;
  if (format === 4 && record.platform === 0 && record.encoding !== 5) return 3;
  return null;
}

export function parseCmap(cmap: Uint8Array): Map<number, number> {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const candidates = records(cmap)
    .map((record) => {
      const format = view.getUint16(record.offset);
      return { record, format, priority: cmapPriority(record, format) };
    })
    .filter(
      (item): item is typeof item & { priority: number } =>
        item.priority !== null,
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.record.platform - right.record.platform ||
        left.record.encoding - right.record.encoding,
    );
  const selected = candidates[0];
  if (!selected) throw new Error("cmap has no supported Unicode subtable.");
  const output = new Map<number, number>();
  if (selected.format === 12)
    parseFormat12(cmap, selected.record.offset, output);
  else parseFormat4(cmap, selected.record.offset, output);
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
      item.platform === 0 &&
      item.encoding === 5 &&
      item.offset + 10 <= cmap.length &&
      view.getUint16(item.offset) === 14,
  );
  if (!record) return [];
  const base = record.offset;
  const length = view.getUint32(base + 2);
  const count = view.getUint32(base + 6);
  if (
    length < 10 ||
    base + length > cmap.length ||
    count > MAX_DECODED_MAPPINGS ||
    count > Math.floor((length - 10) / 11)
  )
    throw new Error("Invalid cmap format 14.");
  const output: VariationSequenceMap[] = [];
  let previousSelector = -1;
  for (let index = 0; index < count; index++) {
    const recordOffset = base + 10 + index * 11;
    const selector = uint24(view, recordOffset);
    const defaultOffset = view.getUint32(recordOffset + 3);
    const nonDefaultOffset = view.getUint32(recordOffset + 7);
    if (
      !isUnicodeScalar(selector) ||
      selector <= previousSelector ||
      !(
        (selector >= 0xfe00 && selector <= 0xfe0f) ||
        (selector >= 0xe0100 && selector <= 0xe01ef)
      )
    )
      throw new Error("Invalid format 14 variation selector.");
    previousSelector = selector;
    const defaults = new Set<number>();
    const nonDefault = new Map<number, number>();
    if (defaultOffset) {
      const table = base + defaultOffset;
      if (table + 4 > base + length)
        throw new Error("Invalid format 14 default UVS offset.");
      const ranges = view.getUint32(table);
      if (
        ranges > MAX_DECODED_MAPPINGS ||
        ranges > Math.floor((base + length - table - 4) / 4)
      )
        throw new Error("Invalid format 14 default UVS table.");
      let previousEnd = -1;
      for (let range = 0; range < ranges; range++) {
        const start = uint24(view, table + 4 + range * 4);
        const additional = view.getUint8(table + 7 + range * 4);
        const end = start + additional;
        if (
          !isUnicodeScalar(start) ||
          !isUnicodeScalar(end) ||
          crossesSurrogateRange(start, end) ||
          start <= previousEnd ||
          defaults.size + additional + 1 > MAX_DECODED_MAPPINGS
        )
          throw new Error("Invalid format 14 default UVS range.");
        previousEnd = end;
        for (let cp = start; cp <= start + additional; cp++) defaults.add(cp);
      }
    }
    if (nonDefaultOffset) {
      const table = base + nonDefaultOffset;
      if (table + 4 > base + length)
        throw new Error("Invalid format 14 non-default UVS offset.");
      const mappings = view.getUint32(table);
      if (
        mappings > MAX_DECODED_MAPPINGS ||
        mappings > Math.floor((base + length - table - 4) / 5)
      )
        throw new Error("Invalid format 14 non-default UVS table.");
      let previousCodepoint = -1;
      for (let mapping = 0; mapping < mappings; mapping++) {
        const codepoint = uint24(view, table + 4 + mapping * 5);
        const glyph = view.getUint16(table + 7 + mapping * 5);
        if (!isUnicodeScalar(codepoint) || codepoint <= previousCodepoint)
          throw new Error("Invalid format 14 non-default UVS mapping.");
        previousCodepoint = codepoint;
        nonDefault.set(codepoint, glyph);
      }
    }
    output.push({ selector, defaults, nonDefault });
  }
  return output;
}

function assertMapping(mapping: ReadonlyMap<number, number>): void {
  if (mapping.size > MAX_DECODED_MAPPINGS)
    throw new Error(`cmap mappings exceed ${MAX_DECODED_MAPPINGS}.`);
  for (const [codepoint, glyph] of mapping) {
    if (!isUnicodeScalar(codepoint))
      throw new Error("cmap contains a non-scalar Unicode value.");
    if (!Number.isInteger(glyph) || glyph < 0 || glyph > 0xffff)
      throw new Error("cmap contains an invalid glyph id.");
  }
}

function format4(mapping: ReadonlyMap<number, number>): Uint8Array | undefined {
  const all = [...mapping]
    .filter(([cp]) => cp <= 0xffff && cp !== 0xffff)
    .sort(([a], [b]) => a - b);
  interface Segment {
    start: number;
    end: number;
    delta: number;
    glyphs: number[] | undefined;
  }
  const segments: Segment[] = [];
  for (let index = 0; index < all.length;) {
    const startIndex = index;
    while (index + 1 < all.length && all[index + 1]![0] === all[index]![0] + 1)
      index++;
    const run = all.slice(startIndex, index + 1);
    const firstDelta = (run[0]![1] - run[0]![0]) & 0xffff;
    const constantDelta = run.every(
      ([cp, glyph]) => ((glyph - cp) & 0xffff) === firstDelta,
    );
    segments.push({
      start: run[0]![0],
      end: run.at(-1)![0],
      delta: constantDelta ? firstDelta : 0,
      glyphs: constantDelta ? undefined : run.map(([, glyph]) => glyph),
    });
    index++;
  }
  const segCount = segments.length + 1;
  const glyphCount = segments.reduce(
    (count, segment) => count + (segment.glyphs?.length ?? 0),
    0,
  );
  const length = 16 + segCount * 8 + glyphCount * 2;
  // A partial format 4 would disagree with the authoritative format 12. Omit
  // it when the 16-bit format cannot represent the complete BMP mapping.
  if (length > 0xffff) return undefined;
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
  let glyphIndex = 0;
  segments.forEach((segment, index) => {
    view.setUint16(endOffset + index * 2, segment.end);
    view.setUint16(startOffset + index * 2, segment.start);
    view.setInt16(deltaOffset + index * 2, segment.delta);
    if (!segment.glyphs) return;
    // The offset is measured from this segment's idRangeOffset word to its
    // first glyphIdArray entry, not from the start of the array.
    view.setUint16(
      rangeOffset + index * 2,
      glyphOffset + glyphIndex * 2 - (rangeOffset + index * 2),
    );
    for (const glyph of segment.glyphs) {
      view.setUint16(glyphOffset + glyphIndex * 2, glyph);
      glyphIndex++;
    }
  });
  const sentinel = segCount - 1;
  view.setUint16(endOffset + sentinel * 2, 0xffff);
  view.setUint16(startOffset + sentinel * 2, 0xffff);
  view.setInt16(deltaOffset + sentinel * 2, 1);
  return bytes;
}

function format14(variations: readonly VariationSequenceMap[]): Uint8Array {
  const normalized = [...variations].sort((a, b) => a.selector - b.selector);
  if (normalized.length > MAX_DECODED_MAPPINGS)
    throw new Error("Too many cmap variation selectors.");
  let previousSelector = -1;
  const defaultTables: Uint8Array[] = [];
  const nonDefaultTables: Uint8Array[] = [];
  for (const item of normalized) {
    if (
      !isUnicodeScalar(item.selector) ||
      item.selector <= previousSelector ||
      !(
        (item.selector >= 0xfe00 && item.selector <= 0xfe0f) ||
        (item.selector >= 0xe0100 && item.selector <= 0xe01ef)
      )
    )
      throw new Error("Invalid cmap variation selector.");
    previousSelector = item.selector;
    const values = [...item.defaults].sort((a, b) => a - b);
    if (
      values.length > MAX_DECODED_MAPPINGS ||
      values.some((codepoint) => !isUnicodeScalar(codepoint))
    )
      throw new Error("Invalid default variation sequence mapping.");
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
    if (
      mappings.length > MAX_DECODED_MAPPINGS ||
      mappings.some(
        ([codepoint, glyph]) =>
          !isUnicodeScalar(codepoint) ||
          !Number.isInteger(glyph) ||
          glyph < 0 ||
          glyph > 0xffff,
      )
    )
      throw new Error("Invalid non-default variation sequence mapping.");
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
  if (groups.length > MAX_FORMAT12_GROUPS)
    throw new Error(`cmap format 12 groups exceed ${MAX_FORMAT12_GROUPS}.`);
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
  assertMapping(mapping);
  const bmp = format4(mapping);
  const full = format12(mapping);
  const variation = variations.length ? format14(variations) : undefined;
  const count = 2 + (bmp ? 1 : 0) + (variation ? 1 : 0);
  const headerLength = 4 + count * 8;
  const bmpOffset = bmp ? headerLength : undefined;
  const fullOffset = align4(bmp ? headerLength + bmp.length : headerLength);
  const variationOffset = align4(fullOffset + full.length);
  const bytes = new Uint8Array(
    variation ? variationOffset + variation.length : fullOffset + full.length,
  );
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0);
  view.setUint16(2, count);
  const encodingRecords: Array<{
    platform: number;
    encoding: number;
    offset: number;
  }> = [{ platform: 0, encoding: 4, offset: fullOffset }];
  if (variation) {
    encodingRecords.push({ platform: 0, encoding: 5, offset: variationOffset });
    bytes.set(variation, variationOffset);
  }
  if (bmp)
    encodingRecords.push({ platform: 3, encoding: 1, offset: bmpOffset! });
  encodingRecords.push({ platform: 3, encoding: 10, offset: fullOffset });
  encodingRecords.forEach((record, index) => {
    const offset = 4 + index * 8;
    view.setUint16(offset, record.platform);
    view.setUint16(offset + 2, record.encoding);
    view.setUint32(offset + 4, record.offset);
  });
  if (bmp) bytes.set(bmp, bmpOffset!);
  bytes.set(full, fullOffset);
  return bytes;
}
