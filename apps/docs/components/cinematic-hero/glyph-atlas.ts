import * as THREE from "three";

export interface GlyphInfo {
  /** Atlas UV rectangle: origin (bottom-left) and size. */
  u: number;
  v: number;
  w: number;
  h: number;
  /** Advance width relative to the cell size. */
  advance: number;
}

export interface GlyphAtlas {
  texture: THREE.CanvasTexture;
  glyphs: Map<string, GlyphInfo>;
  /** Fallback glyph (used for characters missing from the atlas). */
  fallback: GlyphInfo;
}

interface AtlasOptions {
  chars: Iterable<string>;
  family: string;
  weight: number;
  px?: number;
  /** Optional sample text passed to document.fonts.load for subset fonts. */
  sample?: string;
}

/** Printable ASCII plus the few typographic extras the labels use. */
export const LABEL_CHARS = (() => {
  let out = "";
  for (let code = 32; code < 127; code++) out += String.fromCharCode(code);
  return `${out}·→—`;
})();

/**
 * Rasterize a set of characters into a canvas atlas using the browser's own
 * text engine. Because the browser applies @font-face cmap tables, drawing the
 * encoded fixture string with the generated scrambled font produces the
 * intended glyphs: the decode really happens in the rasterizer.
 */
export async function buildGlyphAtlas(
  options: AtlasOptions,
): Promise<GlyphAtlas> {
  const px = options.px ?? 96;
  const font = `${options.weight} ${px}px "${options.family}"`;
  try {
    await document.fonts.load(font, options.sample);
  } catch {
    // Fall through: the canvas will use the fallback stack.
  }

  const unique = [...new Set([...options.chars])];
  const cell = Math.round(px * 1.35);
  const cols = Math.max(1, Math.ceil(Math.sqrt(unique.length)));
  const rows = Math.max(1, Math.ceil(unique.length / cols));
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";

  const glyphs = new Map<string, GlyphInfo>();
  const cellW = cell / canvas.width;
  const cellH = cell / canvas.height;
  unique.forEach((char, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * cell + cell / 2;
    const y = row * cell + cell / 2 + px * 0.04;
    context.fillText(char, x, y);
    const width = context.measureText(char).width;
    glyphs.set(char, {
      u: col * cellW,
      v: 1 - (row + 1) * cellH,
      w: cellW,
      h: cellH,
      advance: width / cell,
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const fallback = glyphs.get(" ") ??
    glyphs.values().next().value ?? { u: 0, v: 0, w: 0, h: 0, advance: 0.5 };
  return { texture, glyphs, fallback };
}
