import { createHmac } from "node:crypto";
import {
  unicodePropertyKeys,
  unicodePropertyRanges,
} from "./generated/unicode17.js";

export const UNICODE_VERSION = "17.0.0" as const;

const STRUCTURAL = /[\p{Z}\p{Cc}\p{Cf}\p{Mc}\p{Me}]/u;
const MARK = /\p{M}/u;

/** Characters whose independent substitution can alter segmentation, ordering, or shaping. */
export function isStructuralCodePoint(cp: number): boolean {
  const value = String.fromCodePoint(cp);
  return (
    STRUCTURAL.test(value) ||
    MARK.test(value) ||
    cp === 0x200c ||
    cp === 0x200d ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

/** Exact Unicode 17 property key generated from the pinned UCD. */
export function propertySignature(cp: number): string | null {
  if (
    !Number.isInteger(cp) ||
    cp < 0 ||
    cp > 0x10ffff ||
    isStructuralCodePoint(cp)
  )
    return null;
  let low = 0;
  let high = unicodePropertyRanges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end, key] = unicodePropertyRanges[middle]!;
    if (cp < start) high = middle - 1;
    else if (cp > end) low = middle + 1;
    else return unicodePropertyKeys[key] ?? null;
  }
  return null;
}

function randomIndex(
  seed: string,
  group: string,
  position: number,
  size: number,
): number {
  const digest = createHmac("sha256", Buffer.from(seed, "base64url"))
    .update(group)
    .update(":" + position)
    .digest();
  return digest.readUInt32BE(0) % size;
}

export interface Permutation {
  encode: ReadonlyMap<number, number>;
  decode: ReadonlyMap<number, number>;
}

export function createPermutation(
  codepoints: Iterable<number>,
  seed: string,
  namespace = "default",
): Permutation {
  const groups = new Map<string, number[]>();
  for (const cp of new Set(codepoints)) {
    const signature = propertySignature(cp);
    if (!signature) continue;
    const group = groups.get(signature) ?? [];
    group.push(cp);
    groups.set(signature, group);
  }

  const encode = new Map<number, number>();
  const decode = new Map<number, number>();
  for (const [signature, values] of groups) {
    values.sort((a, b) => a - b);
    if (values.length < 2) continue;
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = randomIndex(
        seed,
        `${namespace}:${signature}`,
        index,
        index + 1,
      );
      [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
    }
    // Deterministically eliminate fixed points without changing the property pool.
    for (let index = 0; index < values.length; index++) {
      if (shuffled[index] === values[index]) {
        const next = (index + 1) % values.length;
        [shuffled[index], shuffled[next]] = [shuffled[next]!, shuffled[index]!];
      }
    }
    values.forEach((original, index) => {
      const encoded = shuffled[index]!;
      encode.set(original, encoded);
      decode.set(encoded, original);
    });
  }
  return { encode, decode };
}

export function encodeText(text: string, permutation: Permutation): string {
  if (text !== text.normalize("NFC")) {
    throw new Error("Protected text must be NFC-normalized before scrambling.");
  }
  let encoded = "";
  for (const value of text) {
    const cp = value.codePointAt(0)!;
    const signature = propertySignature(cp);
    if (!signature) {
      encoded += value;
      continue;
    }
    const mapped = permutation.encode.get(cp);
    if (mapped === undefined) {
      throw new Error(
        `No Unicode-safe mapping for U+${cp.toString(16).toUpperCase().padStart(4, "0")}.`,
      );
    }
    encoded += String.fromCodePoint(mapped);
  }
  return encoded;
}
