import { inflateSync } from "node:zlib";
import { align4, checksum, writeTag, tag } from "./binary.js";
import {
  buildCmap,
  parseCmap,
  parseVariationSequences,
  type VariationSequenceMap,
} from "./cmap.js";

export interface SfntTable {
  tag: string;
  data: Uint8Array;
}

export interface SfntFont {
  flavor: number;
  tables: ReadonlyMap<string, Uint8Array>;
}

export function parseSfnt(bytes: Uint8Array): SfntFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) throw new Error("Truncated OpenType font.");
  if (tag(bytes, 0) === "ttcf")
    throw new Error("TTC collections are not supported in GlyphScramble 0.1.");
  if (tag(bytes, 0) === "wOFF") return parseWoff(bytes);
  if (tag(bytes, 0) === "wOF2")
    throw new Error("WOFF2 must be decompressed before parsing.");
  const flavor = view.getUint32(0);
  if (flavor !== 0x00010000 && flavor !== 0x4f54544f && flavor !== 0x74727565) {
    throw new Error("Unsupported OpenType scaler type.");
  }
  const count = view.getUint16(4);
  if (12 + count * 16 > bytes.length)
    throw new Error("Truncated OpenType table directory.");
  const tables = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index++) {
    const base = 12 + index * 16;
    const name = tag(bytes, base);
    const offset = view.getUint32(base + 8);
    const length = view.getUint32(base + 12);
    if (offset + length > bytes.length)
      throw new Error(`Truncated ${name} table.`);
    tables.set(name, bytes.slice(offset, offset + length));
  }
  if (!tables.has("head") || !tables.has("cmap"))
    throw new Error("Font requires head and cmap tables.");
  return { flavor, tables };
}

function parseWoff(bytes: Uint8Array): SfntFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || view.getUint32(8) !== bytes.length)
    throw new Error("Invalid WOFF header.");
  const flavor = view.getUint32(4);
  const count = view.getUint16(12);
  if (44 + count * 20 > bytes.length)
    throw new Error("Truncated WOFF directory.");
  const tables = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index++) {
    const base = 44 + index * 20;
    const name = tag(bytes, base);
    const offset = view.getUint32(base + 4);
    const compressed = view.getUint32(base + 8);
    const original = view.getUint32(base + 12);
    if (offset + compressed > bytes.length || compressed > original)
      throw new Error(`Invalid WOFF ${name} table.`);
    const data = bytes.slice(offset, offset + compressed);
    const decoded =
      compressed === original ? data : new Uint8Array(inflateSync(data));
    if (decoded.length !== original)
      throw new Error(`WOFF ${name} table length mismatch.`);
    tables.set(name, decoded);
  }
  return { flavor, tables };
}

export function buildSfnt(font: SfntFont): Uint8Array {
  const tables = [...font.tables].sort(([a], [b]) => a.localeCompare(b));
  const count = tables.length;
  const maxPower = 2 ** Math.floor(Math.log2(count));
  const directoryLength = 12 + count * 16;
  let total = directoryLength;
  for (const [, data] of tables) total += align4(data.length);
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, font.flavor);
  view.setUint16(4, count);
  view.setUint16(6, maxPower * 16);
  view.setUint16(8, Math.log2(maxPower));
  view.setUint16(10, count * 16 - maxPower * 16);
  let tableOffset = directoryLength;
  tables.forEach(([name, original], index) => {
    const data = original.slice();
    if (name === "head" && data.length >= 12)
      new DataView(data.buffer, data.byteOffset).setUint32(8, 0);
    const base = 12 + index * 16;
    writeTag(view, base, name);
    view.setUint32(base + 4, checksum(data));
    view.setUint32(base + 8, tableOffset);
    view.setUint32(base + 12, data.length);
    output.set(data, tableOffset);
    tableOffset += align4(data.length);
  });
  const headIndex = tables.findIndex(([name]) => name === "head");
  if (headIndex >= 0) {
    const headOffset = view.getUint32(12 + headIndex * 16 + 8);
    view.setUint32(headOffset + 8, (0xb1b0afba - checksum(output)) >>> 0);
  }
  return output;
}

export function remapCmap(
  font: SfntFont,
  decode: ReadonlyMap<number, number>,
): SfntFont {
  const cmap = font.tables.get("cmap")!;
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
  return [...parseCmap(font.tables.get("cmap")!).keys()].sort((a, b) => a - b);
}
