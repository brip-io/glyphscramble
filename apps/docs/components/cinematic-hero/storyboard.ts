import fixtureData from "../../src/generated/demo-fixtures.json";

/**
 * Pure data for the landing-page cinematic. No three.js imports live here so
 * the storyboard can be unit-tested and server-rendered.
 */

export type BeatId =
  | "title"
  | "prepare"
  | "buckets"
  | "permute"
  | "bake"
  | "lease"
  | "raw-agent"
  | "human"
  | "recovery";

export type Vec3 = readonly [number, number, number];

export interface CameraKey {
  position: Vec3;
  target: Vec3;
  fov: number;
  /** Local beat time in [0, 1] at which this key is reached. Defaults to 0. */
  at?: number;
  /** Snap to this key instead of interpolating toward it (hard cut). */
  cut?: boolean;
}

export interface Beat {
  id: BeatId;
  index: number;
  /** Short chip label, e.g. "Prepare". */
  label: string;
  /** Claim-safe on-screen caption. Also the screen-reader narrative. */
  caption: string;
  /** Global scroll progress window, inclusive start / exclusive end. */
  range: readonly [number, number];
  camera: readonly CameraKey[];
}

export const SCROLLER_VH = 900;
export const SCROLLER_VH_COMPACT = 700;

const runtime = fixtureData.runtime.a;

export const fixture = {
  sentence: fixtureData.sentence,
  encodedText: runtime.encodedText,
  family: runtime.family,
  fontFile: runtime.fontFile,
  fontUrl: runtime.fontUrl,
  documentCache: runtime.documentCache,
  fontCache: runtime.fontCache,
  staticFamily: fixtureData.static.a.family,
} as const;

export const SFNT_TABLES = [
  "head",
  "hhea",
  "maxp",
  "OS/2",
  "hmtx",
  "cmap",
  "loca",
  "glyf",
  "name",
  "post",
  "GSUB",
  "GPOS",
] as const;

export const beats: readonly Beat[] = [
  {
    id: "title",
    index: 0,
    label: "Title",
    caption:
      "Independent research deserves deliberate access. One sentence, about to travel through the whole GlyphScramble pipeline.",
    range: [0, 0.08],
    camera: [{ position: [0, 0.6, 14], target: [0, 0, 0], fov: 38 }],
  },
  {
    id: "prepare",
    index: 1,
    label: "Prepare",
    caption:
      "Prepare the font once. Only the cmap and the head checksum will change; outlines, GSUB and GPOS bytes are preserved.",
    range: [0.08, 0.2],
    camera: [
      { position: [-1, 1, 12], target: [-2, 0, -2], fov: 40 },
      { position: [-5.5, 2.5, 8.5], target: [-2, 0, -2], fov: 48, at: 0.45 },
      { position: [-4.5, 1.5, 8], target: [-2, 0, -2], fov: 42, at: 1 },
    ],
  },
  {
    id: "buckets",
    index: 2,
    label: "Buckets",
    caption:
      "Codepoints sort into Unicode property buckets, 763 signatures from Unicode 17. Spaces, punctuation and marks are structural and never move.",
    range: [0.2, 0.31],
    camera: [
      { position: [0, 10, 10.5], target: [0, -1, 0], fov: 42 },
      { position: [0, 8, 9.5], target: [0, -1, 0], fov: 42, at: 1 },
    ],
  },
  {
    id: "permute",
    index: 3,
    label: "Permute",
    caption:
      "A CSPRNG seed drives a Fisher-Yates shuffle inside each bucket. The encode map stays on the server; the decode map is about to be baked into the font.",
    range: [0.31, 0.43],
    camera: [
      { position: [0, 2.8, 12.5], target: [0, 0.5, 0], fov: 40 },
      { position: [0, 2, 11], target: [0, 0.4, 0], fov: 40, at: 1 },
    ],
  },
  {
    id: "bake",
    index: 4,
    label: "Bake",
    caption:
      "The rewritten cmap goes back in, the head checksum is fixed, and a worker pool compresses variants to WOFF2 ahead of time.",
    range: [0.43, 0.55],
    camera: [
      { position: [-4, 2, 9], target: [-2, 0, -2], fov: 42 },
      { position: [-3, 1.5, 8], target: [-2, 0, -2], fov: 42, at: 0.55 },
      {
        position: [0, 4, 12],
        target: [0, -1, -3],
        fov: 42,
        at: 0.6,
        cut: true,
      },
      { position: [0, 3, 11], target: [0, -1, -3], fov: 42, at: 1 },
    ],
  },
  {
    id: "lease",
    index: 5,
    label: "Lease",
    caption:
      "Each response leases one pre-baked variant, exactly once. Payload and WOFF2 travel on separate lanes; the font URL carries an AES-256-GCM token that expires.",
    range: [0.55, 0.66],
    camera: [
      { position: [2, 3, 11], target: [0, 0, -2], fov: 40 },
      { position: [0, 2.5, 15], target: [0, 0.3, 0], fov: 42, at: 1 },
    ],
  },
  {
    id: "raw-agent",
    index: 6,
    label: "Raw fetch",
    caption:
      "A raw-fetch scraper reads the response as-is: scrambled scalars. The mapping is not in the document and no client-side decoder exists.",
    range: [0.66, 0.76],
    camera: [
      { position: [4.3, 1.2, 9.5], target: [4.3, 0, 0], fov: 38 },
      { position: [4.8, 0.8, 8.5], target: [4.3, 0, 0], fov: 38, at: 1 },
    ],
  },
  {
    id: "human",
    index: 7,
    label: "Human render",
    caption:
      "The browser loads the matching font. Its cmap maps the encoded codepoints to the original outlines. The same bytes render as the intended sentence.",
    range: [0.76, 0.88],
    camera: [
      { position: [-4.3, 1.2, 9.5], target: [-4.3, 0, 0], fov: 38 },
      { position: [-4.3, 0.8, 8.2], target: [-4.3, 0, 0], fov: 36, at: 1 },
    ],
  },
  {
    id: "recovery",
    index: 8,
    label: "Recovery boundary",
    caption:
      "Browser-capable agents, OCR and font analysis can still recover the text. GlyphScramble raises the cost of bulk DOM scraping. Friction, not DRM.",
    range: [0.88, 1],
    camera: [
      { position: [-2, 2.5, 13], target: [0, -0.6, -1], fov: 42 },
      { position: [0, 3, 16], target: [0, -0.8, -2], fov: 45, at: 1 },
    ],
  },
];

export function beatAt(p: number): Beat {
  const clamped = clamp01(p);
  for (const beat of beats) {
    if (clamped < beat.range[1]) return beat;
  }
  return beats[beats.length - 1]!;
}

export function beatById(id: BeatId): Beat {
  const beat = beats.find((item) => item.id === id);
  if (!beat) throw new Error(`Unknown beat ${id}`);
  return beat;
}

/** Local time in [0, 1] of `p` inside `range`, clamped. */
export function segment(p: number, range: readonly [number, number]): number {
  const span = range[1] - range[0];
  if (span <= 0) return p >= range[1] ? 1 : 0;
  return clamp01((p - range[0]) / span);
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Remap `t` so that it runs 0 → 1 between `from` and `to`, clamped. */
export function hold(t: number, from: number, to: number): number {
  return segment(t, [from, to]);
}

export const ease = {
  inOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  outCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  },
  outExpo(t: number): number {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  },
  outBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inQuad(t: number): number {
    return t * t;
  },
};
