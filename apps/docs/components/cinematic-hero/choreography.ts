import { fixture } from "./storyboard";

/** Scene landmarks (world units; camera looks down -z). */
export const L = {
  slab: [-2, 0, -2] as const,
  ringRadiusX: 3.3,
  ringRadiusY: 2.3,
  binLl: [0, -1, 0] as const,
  binLu: [3.6, -1, 0] as const,
  railZ: 3.6,
  gridY: -1.05,
  conveyorY: -1.3,
  conveyorLanes: [-3.9, -3.3, -2.7, -2.1] as const,
  conveyorHalf: 9,
  heroLane: -3.3,
  token: [0, 1, -1] as const,
  terminal: [4.3, 0, 0] as const,
  browser: [-4.3, 0, 0] as const,
  frameW: 6.6,
  frameH: 3.8,
  brickDock: [-2, 1, 0.3] as const,
  recovery: [-1.5, -2.7, 0.5] as const,
} as const;

export const PALETTE = {
  ink: "#f1f3f1",
  body: "#b8bcb8",
  muted: "#8b908c",
  surface: "#171a1a",
  surface2: "#1d2121",
  canvas: "#090a0a",
  panel: "#0d0f0f",
  line: "#2b2f2f",
  accent: "#79c5c8",
  action: "#0b6268",
  actionBright: "#0e747b",
  fold: "#365556",
  danger: "#ef9a92",
  dangerDim: "#5a3a37",
} as const;

export type CharClass = "lower" | "upper" | "structural";

export function charClass(char: string): CharClass {
  if (/\p{Ll}/u.test(char)) return "lower";
  if (/\p{Lu}/u.test(char)) return "upper";
  return "structural";
}

/** Deterministic hash in [0, 1) for stable per-instance jitter. */
export function hash(index: number, salt = 0): number {
  let x = (index + 1) * 374761393 + salt * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}

export const SENTENCE = fixture.sentence;
export const ENCODED = fixture.encodedText;

/** Real per-codepoint encode map recovered from the public fixture pair. */
export const ENCODE_MAP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (let i = 0; i < SENTENCE.length; i++) {
    const plain = SENTENCE[i]!;
    const encoded = ENCODED[i]!;
    if (charClass(plain) !== "structural") map.set(plain, encoded);
  }
  return map;
})();

export const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

/**
 * The lowercase bucket's permutation, consistent with the fixture wherever the
 * sentence reveals it, filled without fixed points elsewhere, plus the
 * Fisher-Yates swap trace (i descending, j <= i) that produces it.
 */
export const LOWER_PERMUTATION: {
  shuffled: string[];
  swaps: Array<[number, number]>;
} = (() => {
  const shuffled: Array<string | undefined> = ALPHABET.map((char) =>
    ENCODE_MAP.get(char),
  );
  const used = new Set(shuffled.filter((c): c is string => c !== undefined));
  const freePlain = ALPHABET.filter((_, i) => shuffled[i] === undefined);
  const freeTargets = ALPHABET.filter((c) => !used.has(c));
  let assignment = freeTargets;
  for (let offset = 1; offset < freeTargets.length; offset++) {
    const rotated = freeTargets.map(
      (_, i) => freeTargets[(i + offset) % freeTargets.length]!,
    );
    if (rotated.every((target, i) => target !== freePlain[i])) {
      assignment = rotated;
      break;
    }
  }
  freePlain.forEach((plain, i) => {
    shuffled[ALPHABET.indexOf(plain)] = assignment[i]!;
  });
  const final = shuffled.map((c, i) => c ?? ALPHABET[i]!);
  const order = ALPHABET.map((_, i) => i);
  const target = final.map((c) => ALPHABET.indexOf(c));
  const swaps: Array<[number, number]> = [];
  for (let i = order.length - 1; i > 0; i--) {
    const j = order.indexOf(target[i]!);
    if (j !== i) {
      const a = order[i]!;
      order[i] = order[j]!;
      order[j] = a;
      swaps.push([i, j]);
    }
  }
  return { shuffled: final, swaps };
})();

/** Word-wrapped layout of the sentence into two frame lines. */
export const LINES: Array<{ start: number; end: number }> = (() => {
  const words = SENTENCE.split(" ");
  const lines: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  let lineStart = 0;
  let count = 0;
  for (const word of words) {
    if (count >= 2) {
      lines.push({ start: lineStart, end: cursor - 1 });
      lineStart = cursor;
      count = 0;
    }
    cursor += word.length + 1;
    count++;
  }
  lines.push({ start: lineStart, end: SENTENCE.length });
  return lines;
})();

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
