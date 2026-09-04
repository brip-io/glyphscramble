import { createCipheriv, createHmac } from "node:crypto";
import {
  unicodePropertyKeys,
  unicodePropertyRanges,
  unicodeStructuralRanges,
} from "./generated/unicode17.js";

export const UNICODE_VERSION = "17.0.0" as const;
export const PERMUTATION_ALGORITHM =
  "glyphscramble-aes-256-ctr-rejection-v2" as const;

export class UnsupportedTextError extends Error {
  constructor(
    readonly codepoint: number,
    readonly normalization: "nfc" | "not-nfc",
  ) {
    super(
      `No Unicode-safe mapping for U+${codepoint
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")} (${normalization}).`,
    );
    this.name = "UnsupportedTextError";
  }
}

const UINT32_RANGE = 0x1_0000_0000;
const KEYSTREAM_BLOCK_BYTES = 256;
const ZERO_KEYSTREAM_BLOCK = Buffer.alloc(KEYSTREAM_BLOCK_BYTES);

/** Characters whose independent substitution can alter segmentation, ordering, or shaping. */
export function isStructuralCodePoint(cp: number): boolean {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return false;
  let low = 0;
  let high = unicodeStructuralRanges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end] = unicodeStructuralRanges[middle]!;
    if (cp < start) high = middle - 1;
    else if (cp > end) low = middle + 1;
    else return true;
  }
  return false;
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

/** Converts uniform 32-bit words to a bounded value without modulo bias. */
export function unbiasedIndex(nextUint32: () => number, size: number): number {
  if (!Number.isSafeInteger(size) || size < 1 || size > UINT32_RANGE)
    throw new Error(
      "Permutation bound must be an integer from 1 through 2^32.",
    );
  const limit = Math.floor(UINT32_RANGE / size) * size;
  let value: number;
  do {
    value = nextUint32();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE)
      throw new Error(
        "Permutation keystream must return unsigned 32-bit words.",
      );
  } while (value >= limit);
  return value % size;
}

function keystream(
  seed: string,
  namespace: string,
  signature: string,
): () => number {
  const seedBytes = Buffer.from(seed, "base64url");
  const derive = (purpose: string): Buffer => {
    const hmac = createHmac("sha256", seedBytes);
    for (const value of [
      purpose,
      PERMUTATION_ALGORITHM,
      UNICODE_VERSION,
      namespace,
      signature,
    ]) {
      const bytes = Buffer.from(value);
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(bytes.length);
      hmac.update(length).update(bytes);
    }
    return hmac.digest();
  };
  const key = derive("glyphscramble:permutation:key");
  const counter = derive("glyphscramble:permutation:counter").subarray(0, 16);
  const cipher = createCipheriv("aes-256-ctr", key, counter);
  let bytes = Buffer.alloc(0);
  let offset = 0;
  return () => {
    if (offset === bytes.length) {
      bytes = cipher.update(ZERO_KEYSTREAM_BLOCK);
      offset = 0;
    }
    const value = bytes.readUInt32BE(offset);
    offset += 4;
    return value;
  };
}

export interface Permutation {
  encode: ReadonlyMap<number, number>;
  decode: ReadonlyMap<number, number>;
}

/** Compact immutable lookup retained with a generated response font. */
export interface CodePointMapping {
  readonly size: number;
  readonly byteLength: number;
  get(codepoint: number): number | undefined;
}

class CompactCodePointMapping implements CodePointMapping {
  readonly #keys: Uint32Array;
  readonly #target: Uint32Array;
  readonly #size: number;
  readonly #mask: number;

  constructor(entries: readonly (readonly [number, number])[]) {
    let capacity = 2;
    while (capacity * 0.7 < entries.length) capacity *= 2;
    this.#keys = new Uint32Array(capacity);
    this.#target = new Uint32Array(capacity);
    this.#size = entries.length;
    this.#mask = capacity - 1;
    for (const [source, target] of entries) {
      let slot = this.#slot(source);
      while (this.#keys[slot] !== 0) slot = (slot + 1) & this.#mask;
      this.#keys[slot] = source + 1;
      this.#target[slot] = target;
    }
    Object.freeze(this);
  }

  get size(): number {
    return this.#size;
  }

  get byteLength(): number {
    return this.#keys.byteLength + this.#target.byteLength;
  }

  get(codepoint: number): number | undefined {
    if (!Number.isInteger(codepoint) || codepoint < 0 || codepoint > 0x10ffff)
      return undefined;
    const key = codepoint + 1;
    let slot = this.#slot(codepoint);
    while (this.#keys[slot] !== 0) {
      if (this.#keys[slot] === key) return this.#target[slot];
      slot = (slot + 1) & this.#mask;
    }
    return undefined;
  }

  #slot(codepoint: number): number {
    return (Math.imul(codepoint, 0x9e37_79b1) >>> 0) & this.#mask;
  }
}

export function compactEncodeMapping(
  mapping: ReadonlyMap<number, number>,
): CodePointMapping {
  return new CompactCodePointMapping([...mapping]);
}

export interface PermutationPlan {
  readonly groups: readonly {
    readonly signature: string;
    readonly values: readonly number[];
  }[];
}

/** Precomputes stable Unicode-property groups shared by response seeds. */
export function createPermutationPlan(
  codepoints: Iterable<number>,
): PermutationPlan {
  const groups = new Map<string, number[]>();
  for (const cp of new Set(codepoints)) {
    const signature = propertySignature(cp);
    if (!signature) continue;
    const group = groups.get(signature) ?? [];
    group.push(cp);
    groups.set(signature, group);
  }
  return {
    groups: [...groups].map(([signature, values]) => ({
      signature,
      values: values.sort((left, right) => left - right),
    })),
  };
}

/** Applies a fresh seed to precomputed groups without reclassifying the face. */
export function createPermutationFromPlan(
  plan: PermutationPlan,
  seed: string,
  namespace = "default",
): Permutation {
  const encode = new Map<number, number>();
  const decode = new Map<number, number>();
  for (const { signature, values } of plan.groups) {
    if (values.length < 2) continue;
    const shuffled = [...values];
    const nextUint32 = keystream(seed, namespace, signature);
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = unbiasedIndex(nextUint32, index + 1);
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

export function createPermutation(
  codepoints: Iterable<number>,
  seed: string,
  namespace = "default",
): Permutation {
  return createPermutationFromPlan(
    createPermutationPlan(codepoints),
    seed,
    namespace,
  );
}

function firstNormalizationDifference(
  text: string,
  normalized: string,
): number {
  const original = [...text];
  const canonical = [...normalized];
  const length = Math.max(original.length, canonical.length);
  for (let index = 0; index < length; index++) {
    if (original[index] !== canonical[index])
      return (original[index] ?? canonical[index] ?? "\uFFFD").codePointAt(0)!;
  }
  return original[0]?.codePointAt(0) ?? 0xfffd;
}

/** Validates content without allocating or acquiring a response variant. */
export function assertTextSupported(
  text: string,
  supports: (codepoint: number) => boolean,
): void {
  const normalized = text.normalize("NFC");
  if (text !== normalized)
    throw new UnsupportedTextError(
      firstNormalizationDifference(text, normalized),
      "not-nfc",
    );
  for (const value of text) {
    const codepoint = value.codePointAt(0)!;
    if (isStructuralCodePoint(codepoint)) continue;
    if (!propertySignature(codepoint) || !supports(codepoint))
      throw new UnsupportedTextError(codepoint, "nfc");
  }
}

export function encodeText(
  text: string,
  permutation: Permutation | CodePointMapping,
): string {
  const normalized = text.normalize("NFC");
  if (text !== normalized)
    throw new UnsupportedTextError(
      firstNormalizationDifference(text, normalized),
      "not-nfc",
    );
  let encoded = "";
  const resolved = new Map<number, string>();
  for (const value of text) {
    const cp = value.codePointAt(0)!;
    const cached = resolved.get(cp);
    if (cached !== undefined) {
      encoded += cached;
      continue;
    }
    if (isStructuralCodePoint(cp)) {
      encoded += value;
      resolved.set(cp, value);
      continue;
    }
    if (!propertySignature(cp)) throw new UnsupportedTextError(cp, "nfc");
    const mapped =
      "encode" in permutation
        ? permutation.encode.get(cp)
        : permutation.get(cp);
    if (mapped === undefined) throw new UnsupportedTextError(cp, "nfc");
    const replacement = String.fromCodePoint(mapped);
    resolved.set(cp, replacement);
    encoded += replacement;
  }
  return encoded;
}
