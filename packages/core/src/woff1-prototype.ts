import { deflateSync } from "node:zlib";
import { align4 } from "./binary.js";
import type { SfntFont } from "./sfnt.js";

function writeTag(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < 4; index++)
    bytes[offset + index] = value.charCodeAt(index);
}

function tableChecksum(bytes: Uint8Array, zeroAdjustment = false): number {
  const padded = new Uint8Array(align4(bytes.length));
  padded.set(bytes);
  if (zeroAdjustment && padded.length >= 12) padded.fill(0, 8, 12);
  const view = new DataView(padded.buffer);
  let total = 0;
  for (let offset = 0; offset < padded.length; offset += 4)
    total = (total + view.getUint32(offset)) >>> 0;
  return total;
}

function encodedTable(data: Uint8Array): Uint8Array {
  const compressed = new Uint8Array(deflateSync(data));
  return compressed.length < data.length ? compressed : data;
}

/** Cache immutable WOFF 1.0 table payloads; cmap/head remain variant-specific. */
export function createPrototypeTableCache(
  font: SfntFont,
): ReadonlyMap<string, Uint8Array> {
  return new Map(
    [...font.tables]
      .filter(([tag]) => tag !== "cmap" && tag !== "head")
      .map(([tag, data]) => [tag, encodedTable(data)]),
  );
}

/** Experimental only: assemble a standards-valid WOFF 1.0 table container. */
export function buildPrototypeWoff1(
  font: SfntFont,
  cachedTables: ReadonlyMap<string, Uint8Array> = new Map(),
): Uint8Array {
  const tables = [...font.tables].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const records = tables.map(([tag, data]) => ({
    tag,
    data,
    encoded: cachedTables.get(tag) ?? encodedTable(data),
    offset: 0,
  }));
  let offset = 44 + records.length * 20;
  for (const record of records) {
    record.offset = offset;
    offset = align4(offset + record.encoded.length);
  }
  const output = new Uint8Array(offset);
  const view = new DataView(output.buffer);
  writeTag(output, 0, "wOFF");
  view.setUint32(4, font.flavor);
  view.setUint32(8, output.length);
  view.setUint16(12, records.length);
  view.setUint16(14, 0);
  view.setUint32(
    16,
    12 +
      records.length * 16 +
      records.reduce((total, record) => total + align4(record.data.length), 0),
  );
  view.setUint16(20, 1);
  records.forEach((record, index) => {
    const directory = 44 + index * 20;
    writeTag(output, directory, record.tag);
    view.setUint32(directory + 4, record.offset);
    view.setUint32(directory + 8, record.encoded.length);
    view.setUint32(directory + 12, record.data.length);
    view.setUint32(
      directory + 16,
      tableChecksum(record.data, record.tag === "head"),
    );
    output.set(record.encoded, record.offset);
  });
  return output;
}
