import { tag } from "./binary.js";
import type { SfntFont } from "./sfnt.js";
import type {
  FontAxisMetadata,
  FontFaceDescriptors,
  FontFaceMetadata,
} from "./types.js";

const WIDTH_CLASSES: Record<number, string> = {
  1: "ultra-condensed",
  2: "extra-condensed",
  3: "condensed",
  4: "semi-condensed",
  5: "normal",
  6: "semi-expanded",
  7: "expanded",
  8: "extra-expanded",
  9: "ultra-expanded",
};

function utf16be(bytes: Uint8Array): string {
  let value = "";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 1 < bytes.length; offset += 2)
    value += String.fromCharCode(view.getUint16(offset));
  return value.replaceAll("\u0000", "").trim();
}

function latin(bytes: Uint8Array): string {
  return new TextDecoder("latin1")
    .decode(bytes)
    .replaceAll("\u0000", "")
    .trim();
}

function fontNames(font: SfntFont): FontFaceMetadata["names"] {
  const table = font.tables.get("name");
  if (!table || table.length < 6) return {};
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const count = view.getUint16(2);
  const strings = view.getUint16(4);
  if (6 + count * 12 > table.length || strings > table.length) return {};

  const candidates = new Map<number, Array<{ score: number; value: string }>>();
  for (let index = 0; index < count; index++) {
    const base = 6 + index * 12;
    const platform = view.getUint16(base);
    const language = view.getUint16(base + 4);
    const nameId = view.getUint16(base + 6);
    if (![1, 2, 6, 16, 17].includes(nameId)) continue;
    const length = view.getUint16(base + 8);
    const offset = strings + view.getUint16(base + 10);
    if (offset + length > table.length) continue;
    const raw = table.subarray(offset, offset + length);
    const value = platform === 0 || platform === 3 ? utf16be(raw) : latin(raw);
    if (!value) continue;
    const score =
      (platform === 3 ? 4 : platform === 0 ? 3 : 1) +
      (language === 0x0409 || language === 0 ? 2 : 0);
    const list = candidates.get(nameId) ?? [];
    list.push({ score, value });
    candidates.set(nameId, list);
  }
  const best = (ids: readonly number[]): string | undefined => {
    const values = ids.flatMap((id) => candidates.get(id) ?? []);
    return values.sort((a, b) => b.score - a.score)[0]?.value;
  };
  const family = best([16, 1]);
  const subfamily = best([17, 2]);
  const postscript = best([6]);
  return {
    ...(family ? { family } : {}),
    ...(subfamily ? { subfamily } : {}),
    ...(postscript ? { postscript } : {}),
  };
}

function inferredDescriptors(
  font: SfntFont,
  names: FontFaceMetadata["names"],
  fallbackFamily: string,
): FontFaceDescriptors {
  const os2 = font.tables.get("OS/2");
  const head = font.tables.get("head");
  let weight = 400;
  let width = 5;
  let italic = false;
  if (os2 && os2.length >= 8) {
    const view = new DataView(os2.buffer, os2.byteOffset, os2.byteLength);
    weight = view.getUint16(4) || 400;
    width = view.getUint16(6) || 5;
    if (os2.length >= 64) italic = Boolean(view.getUint16(62) & 1);
  }
  if (!italic && head && head.length >= 46) {
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    italic = Boolean(view.getUint16(44) & 2);
  }
  return {
    family: names.family ?? fallbackFamily,
    weight: String(Math.min(1000, Math.max(1, weight))),
    style: italic ? "italic" : "normal",
    stretch: WIDTH_CLASSES[width] ?? "normal",
    unicodeRange: [],
  };
}

function fixed(view: DataView, offset: number): number {
  return view.getInt32(offset) / 65_536;
}

function fontAxes(font: SfntFont): FontAxisMetadata[] {
  const table = font.tables.get("fvar");
  if (!table || table.length < 16) return [];
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const axesOffset = view.getUint16(4);
  const axisCount = view.getUint16(8);
  const axisSize = view.getUint16(10);
  if (axisSize < 20 || axesOffset + axisCount * axisSize > table.length)
    return [];
  const axes: FontAxisMetadata[] = [];
  for (let index = 0; index < axisCount; index++) {
    const offset = axesOffset + index * axisSize;
    axes.push({
      tag: tag(table, offset),
      min: fixed(view, offset + 4),
      default: fixed(view, offset + 8),
      max: fixed(view, offset + 12),
    });
  }
  return axes;
}

function layoutFeatureTags(table: Uint8Array | undefined): string[] {
  if (!table || table.length < 10) return [];
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const featureList = view.getUint16(6);
  if (featureList + 2 > table.length) return [];
  const count = view.getUint16(featureList);
  if (featureList + 2 + count * 6 > table.length) return [];
  const values: string[] = [];
  for (let index = 0; index < count; index++)
    values.push(tag(table, featureList + 2 + index * 6));
  return values;
}

export function extractFontMetadata(
  font: SfntFont,
  fallbackFamily: string,
): Pick<FontFaceMetadata, "names" | "descriptors" | "axes" | "features"> {
  const names = fontNames(font);
  return {
    names,
    descriptors: inferredDescriptors(font, names, fallbackFamily),
    axes: fontAxes(font),
    features: [
      ...new Set([
        ...layoutFeatureTags(font.tables.get("GSUB")),
        ...layoutFeatureTags(font.tables.get("GPOS")),
      ]),
    ].sort(),
  };
}
