import { inflateSync } from "node:zlib";
import { align4, checksum, tag, writeTag } from "./binary.js";
import {
  buildCmap,
  parseCmap,
  parseVariationSequences,
  type VariationSequenceMap,
} from "./cmap.js";

const SFNT_CHECKSUM = 0xb1b0afba;
const HEAD_MAGIC = 0x5f0f3cf5;
const WOFF_HEADER_BYTES = 44;
const WOFF2_HEADER_BYTES = 48;

export interface SfntTable {
  tag: string;
  data: Uint8Array;
}

export interface SfntFont {
  flavor: number;
  tables: ReadonlyMap<string, Uint8Array>;
}

export interface FontParseLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxTableBytes: number;
  maxTables: number;
}

export const DEFAULT_FONT_PARSE_LIMITS: Readonly<FontParseLimits> = {
  maxInputBytes: 16 * 1024 * 1024,
  maxOutputBytes: 16 * 1024 * 1024,
  maxTableBytes: 8 * 1024 * 1024,
  maxTables: 128,
};

interface TableRecord {
  name: string;
  checksum: number;
  offset: number;
  length: number;
  paddedEnd: number;
}

interface WoffTableRecord {
  name: string;
  checksum: number;
  offset: number;
  compressed: number;
  original: number;
  end: number;
}

function parseLimits(overrides: Partial<FontParseLimits>): FontParseLimits {
  const limits = { ...DEFAULT_FONT_PARSE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`Font parse limit ${name} must be a positive integer.`);
  }
  return limits;
}

function validFlavor(flavor: number): boolean {
  return (
    flavor === 0x00010000 || flavor === 0x4f54544f || flavor === 0x74727565
  );
}

function assertFlavor(flavor: number): void {
  if (!validFlavor(flavor))
    throw new Error("Unsupported OpenType scaler type.");
}

function sortedTagCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertTag(name: string): void {
  if (
    name.length !== 4 ||
    [...name].some((value) => {
      const codepoint = value.codePointAt(0)!;
      return codepoint < 0x20 || codepoint > 0x7e;
    })
  )
    throw new Error(
      "OpenType table tags must contain four printable ASCII bytes.",
    );
}

function expectedSearchFields(count: number): {
  searchRange: number;
  entrySelector: number;
  rangeShift: number;
} {
  const power = 2 ** Math.floor(Math.log2(count));
  return {
    searchRange: power * 16,
    entrySelector: Math.log2(power),
    rangeShift: count * 16 - power * 16,
  };
}

function boundedRange(
  offset: number,
  length: number,
  total: number,
  description: string,
): number {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > total ||
    length > total - offset
  )
    throw new Error(`Invalid ${description} range.`);
  return offset + length;
}

function assertNoOverlap(
  ranges: readonly { name: string; start: number; end: number }[],
): void {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.start < previous.end)
      throw new Error(`${current.name} overlaps ${previous.name}.`);
  }
}

function tableChecksum(name: string, bytes: Uint8Array): number {
  if (name !== "head") return checksum(bytes);
  if (bytes.length < 12) throw new Error("Invalid head table length.");
  const copy = bytes.slice();
  new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint32(8, 0);
  return checksum(copy);
}

function assertHead(table: Uint8Array | undefined): void {
  if (!table || table.length < 54)
    throw new Error("Font requires a valid head table.");
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  if (view.getUint32(12) !== HEAD_MAGIC)
    throw new Error("Invalid head table magic number.");
  const unitsPerEm = view.getUint16(18);
  if (unitsPerEm < 16 || unitsPerEm > 16_384)
    throw new Error("Invalid head unitsPerEm value.");
  if (view.getInt16(50) < 0 || view.getInt16(50) > 1)
    throw new Error("Invalid head indexToLocFormat value.");
}

function assertRequiredTables(tables: ReadonlyMap<string, Uint8Array>): void {
  assertHead(tables.get("head"));
  if (!tables.has("cmap")) throw new Error("Font requires a cmap table.");
}

function parseSfntRecords(
  bytes: Uint8Array,
  limits: FontParseLimits,
): { flavor: number; records: TableRecord[]; directoryEnd: number } {
  if (bytes.length < 12) throw new Error("Truncated OpenType font.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flavor = view.getUint32(0);
  assertFlavor(flavor);
  const count = view.getUint16(4);
  if (count < 1 || count > limits.maxTables)
    throw new Error(`OpenType table count exceeds ${limits.maxTables}.`);
  const directoryEnd = boundedRange(
    12,
    count * 16,
    bytes.length,
    "OpenType table directory",
  );
  const expected = expectedSearchFields(count);
  if (
    view.getUint16(6) !== expected.searchRange ||
    view.getUint16(8) !== expected.entrySelector ||
    view.getUint16(10) !== expected.rangeShift
  )
    throw new Error("Invalid OpenType offset-table search fields.");

  const seen = new Set<string>();
  const records: TableRecord[] = [];
  let previousTag = "";
  for (let index = 0; index < count; index++) {
    const base = 12 + index * 16;
    const name = tag(bytes, base);
    assertTag(name);
    if (seen.has(name)) throw new Error(`Duplicate OpenType table ${name}.`);
    if (previousTag && sortedTagCompare(previousTag, name) >= 0)
      throw new Error("OpenType table directory is not sorted by tag.");
    previousTag = name;
    seen.add(name);
    const offset = view.getUint32(base + 8);
    const length = view.getUint32(base + 12);
    if (length > limits.maxTableBytes)
      throw new Error(
        `OpenType table ${name} exceeds ${limits.maxTableBytes} bytes.`,
      );
    if (offset % 4 !== 0)
      throw new Error(`OpenType table ${name} is not four-byte aligned.`);
    if (offset < directoryEnd)
      throw new Error(`OpenType table ${name} overlaps the table directory.`);
    const end = boundedRange(offset, length, bytes.length, `${name} table`);
    const paddedEnd = Math.min(align4(end), bytes.length);
    records.push({
      name,
      checksum: view.getUint32(base + 4),
      offset,
      length,
      paddedEnd,
    });
  }
  assertNoOverlap(
    records.map((record) => ({
      name: `${record.name} table`,
      start: record.offset,
      end: record.paddedEnd,
    })),
  );
  return { flavor, records, directoryEnd };
}

function parseRawSfnt(bytes: Uint8Array, limits: FontParseLimits): SfntFont {
  const { flavor, records } = parseSfntRecords(bytes, limits);
  const tables = new Map<string, Uint8Array>();
  for (const record of records) {
    const data = bytes.slice(record.offset, record.offset + record.length);
    if (tableChecksum(record.name, data) !== record.checksum)
      throw new Error(`OpenType table ${record.name} checksum mismatch.`);
    tables.set(record.name, data);
  }
  assertRequiredTables(tables);
  if (checksum(bytes) !== SFNT_CHECKSUM)
    throw new Error("OpenType whole-font checksum mismatch.");
  return { flavor, tables };
}

function parseWoff(bytes: Uint8Array, limits: FontParseLimits): SfntFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < WOFF_HEADER_BYTES || view.getUint32(8) !== bytes.length)
    throw new Error("Invalid WOFF header.");
  const flavor = view.getUint32(4);
  assertFlavor(flavor);
  const count = view.getUint16(12);
  if (count < 1 || count > limits.maxTables)
    throw new Error(`WOFF table count exceeds ${limits.maxTables}.`);
  if (view.getUint16(14) !== 0) throw new Error("Invalid WOFF reserved field.");
  const directoryEnd = boundedRange(
    WOFF_HEADER_BYTES,
    count * 20,
    bytes.length,
    "WOFF table directory",
  );
  const declaredOutput = view.getUint32(16);
  if (declaredOutput > limits.maxOutputBytes)
    throw new Error(`WOFF output exceeds ${limits.maxOutputBytes} bytes.`);

  const records: WoffTableRecord[] = [];
  const seen = new Set<string>();
  const ranges: Array<{ name: string; start: number; end: number }> = [];
  let expectedOutput = 12 + count * 16;
  let previousTag = "";
  for (let index = 0; index < count; index++) {
    const base = WOFF_HEADER_BYTES + index * 20;
    const name = tag(bytes, base);
    assertTag(name);
    if (seen.has(name)) throw new Error(`Duplicate WOFF table ${name}.`);
    if (previousTag && sortedTagCompare(previousTag, name) >= 0)
      throw new Error("WOFF table directory is not sorted by tag.");
    previousTag = name;
    seen.add(name);
    const offset = view.getUint32(base + 4);
    const compressed = view.getUint32(base + 8);
    const original = view.getUint32(base + 12);
    const expectedChecksum = view.getUint32(base + 16);
    if (original > limits.maxTableBytes)
      throw new Error(
        `WOFF table ${name} exceeds ${limits.maxTableBytes} bytes.`,
      );
    if (compressed > original || offset % 4 !== 0 || offset < directoryEnd)
      throw new Error(`Invalid WOFF ${name} table.`);
    const end = boundedRange(
      offset,
      compressed,
      bytes.length,
      `WOFF ${name} table`,
    );
    ranges.push({
      name: `WOFF ${name} table`,
      start: offset,
      end: Math.min(align4(end), bytes.length),
    });
    records.push({
      name,
      checksum: expectedChecksum,
      offset,
      compressed,
      original,
      end,
    });
    expectedOutput += align4(original);
    if (expectedOutput > limits.maxOutputBytes)
      throw new Error(`WOFF output exceeds ${limits.maxOutputBytes} bytes.`);
  }
  if (expectedOutput !== declaredOutput)
    throw new Error("WOFF totalSfntSize does not match its tables.");
  const metadata = optionalWoffBlock(
    bytes,
    directoryEnd,
    "metadata",
    24,
    28,
    32,
    limits.maxOutputBytes,
  );
  const privateData = optionalWoffBlock(
    bytes,
    directoryEnd,
    "private data",
    36,
    40,
  );
  assertNoOverlap([
    ...ranges,
    ...(metadata ? [metadata] : []),
    ...(privateData ? [privateData] : []),
  ]);

  // Decode only after the complete container layout has been validated. This
  // prevents overlapping records from amplifying decompression work.
  const tables = new Map<string, Uint8Array>();
  for (const record of records) {
    const source = bytes.slice(record.offset, record.end);
    let decoded: Uint8Array;
    try {
      decoded =
        record.compressed === record.original
          ? source
          : new Uint8Array(
              inflateSync(source, { maxOutputLength: record.original }),
            );
    } catch (error) {
      throw new Error(`Invalid compressed WOFF ${record.name} table.`, {
        cause: error,
      });
    }
    if (decoded.length !== record.original)
      throw new Error(`WOFF ${record.name} table length mismatch.`);
    if (tableChecksum(record.name, decoded) !== record.checksum)
      throw new Error(`WOFF table ${record.name} checksum mismatch.`);
    tables.set(record.name, decoded);
  }
  assertRequiredTables(tables);
  return { flavor, tables };
}

function optionalWoffBlock(
  bytes: Uint8Array,
  directoryEnd: number,
  name: string,
  offsetField: number,
  lengthField: number,
  originalLengthField?: number,
  maxOriginalBytes?: number,
): { name: string; start: number; end: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = view.getUint32(offsetField);
  const length = view.getUint32(lengthField);
  const originalLength =
    originalLengthField === undefined
      ? undefined
      : view.getUint32(originalLengthField);
  if (offset === 0 && length === 0 && (!originalLengthField || !originalLength))
    return undefined;
  if (offset === 0 || length === 0 || offset < directoryEnd)
    throw new Error(`Invalid WOFF ${name} block.`);
  if (
    originalLength !== undefined &&
    (originalLength === 0 ||
      (maxOriginalBytes !== undefined && originalLength > maxOriginalBytes))
  )
    throw new Error(`Invalid WOFF ${name} original length.`);
  const end = boundedRange(offset, length, bytes.length, `WOFF ${name}`);
  return { name: `WOFF ${name}`, start: offset, end };
}

export function woff2DeclaredSize(
  bytes: Uint8Array,
  overrides: Partial<FontParseLimits> = {},
): number {
  const limits = parseLimits(overrides);
  if (bytes.length > limits.maxInputBytes)
    throw new Error(`WOFF2 input exceeds ${limits.maxInputBytes} bytes.`);
  if (bytes.length < WOFF2_HEADER_BYTES || tag(bytes, 0) !== "wOF2")
    throw new Error("Invalid WOFF2 header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assertFlavor(view.getUint32(4));
  if (view.getUint32(8) !== bytes.length || view.getUint16(14) !== 0)
    throw new Error("Invalid WOFF2 header.");
  const count = view.getUint16(12);
  if (count < 1 || count > limits.maxTables)
    throw new Error(`WOFF2 table count exceeds ${limits.maxTables}.`);
  const output = view.getUint32(16);
  if (output < 12 + count * 16 || output > limits.maxOutputBytes)
    throw new Error(`WOFF2 output exceeds ${limits.maxOutputBytes} bytes.`);
  if (view.getUint32(20) > bytes.length - WOFF2_HEADER_BYTES)
    throw new Error("Invalid WOFF2 compressed-size field.");
  return output;
}

export function parseSfnt(
  bytes: Uint8Array,
  overrides: Partial<FontParseLimits> = {},
): SfntFont {
  const limits = parseLimits(overrides);
  if (bytes.length > limits.maxInputBytes)
    throw new Error(`Font input exceeds ${limits.maxInputBytes} bytes.`);
  if (bytes.length < 4) throw new Error("Truncated OpenType font.");
  const signature = tag(bytes, 0);
  if (signature === "ttcf")
    throw new Error("TTC collections are not supported in GlyphScramble 0.1.");
  if (signature === "wOFF") return parseWoff(bytes, limits);
  if (signature === "wOF2")
    throw new Error("WOFF2 must be decompressed before parsing.");
  return parseRawSfnt(bytes, limits);
}

export function buildSfnt(font: SfntFont): Uint8Array {
  assertFlavor(font.flavor);
  const tables = [...font.tables].sort(([left], [right]) =>
    sortedTagCompare(left, right),
  );
  const count = tables.length;
  if (count < 1 || count > 0xffff)
    throw new Error("A font must contain between 1 and 65,535 tables.");
  const expected = expectedSearchFields(count);
  const directoryLength = 12 + count * 16;
  let total = directoryLength;
  const seen = new Set<string>();
  for (const [name, data] of tables) {
    assertTag(name);
    if (seen.has(name)) throw new Error(`Duplicate OpenType table ${name}.`);
    seen.add(name);
    if (data.length > 0xffffffff - total)
      throw new Error("OpenType output exceeds the format limit.");
    total += align4(data.length);
  }
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, font.flavor);
  view.setUint16(4, count);
  view.setUint16(6, expected.searchRange);
  view.setUint16(8, expected.entrySelector);
  view.setUint16(10, expected.rangeShift);
  let tableOffset = directoryLength;
  tables.forEach(([name, original], index) => {
    const data = original.slice();
    if (name === "head" && data.length >= 12)
      new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(
        8,
        0,
      );
    const base = 12 + index * 16;
    writeTag(view, base, name);
    view.setUint32(base + 4, tableChecksum(name, data));
    view.setUint32(base + 8, tableOffset);
    view.setUint32(base + 12, data.length);
    output.set(data, tableOffset);
    tableOffset += align4(data.length);
  });
  const headIndex = tables.findIndex(([name]) => name === "head");
  if (headIndex >= 0) {
    const headOffset = view.getUint32(12 + headIndex * 16 + 8);
    if (view.getUint32(12 + headIndex * 16 + 12) < 12)
      throw new Error("Invalid head table length.");
    view.setUint32(headOffset + 8, (SFNT_CHECKSUM - checksum(output)) >>> 0);
  }
  return output;
}

export function remapCmap(
  font: SfntFont,
  decode: ReadonlyMap<number, number>,
): SfntFont {
  const cmap = font.tables.get("cmap");
  if (!cmap) throw new Error("Font requires a cmap table.");
  const original = parseCmap(cmap);
  const remapped = new Map(original);
  for (const [encoded, intended] of decode) {
    const glyph = original.get(intended);
    if (glyph === undefined)
      throw new Error(
        `Font has no glyph for U+${intended.toString(16).toUpperCase()}.`,
      );
    remapped.set(encoded, glyph);
  }
  const encode = new Map<number, number>(
    [...decode].map(([encoded, intended]) => [intended, encoded]),
  );
  const variations: VariationSequenceMap[] = parseVariationSequences(cmap).map(
    (item) => ({
      selector: item.selector,
      defaults: new Set([...item.defaults].map((cp) => encode.get(cp) ?? cp)),
      nonDefault: new Map(
        [...item.nonDefault].map(([cp, glyph]) => [
          encode.get(cp) ?? cp,
          glyph,
        ]),
      ),
    }),
  );
  return {
    flavor: font.flavor,
    tables: new Map([
      ...font.tables,
      ["cmap", buildCmap(remapped, variations)],
    ]),
  };
}

export function fontCodepoints(font: SfntFont): number[] {
  const cmap = font.tables.get("cmap");
  if (!cmap) throw new Error("Font requires a cmap table.");
  return [...parseCmap(cmap).keys()].sort((left, right) => left - right);
}
