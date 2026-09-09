export const GLYPH_STATIC_BOUNDARY_SOURCE = "static-boundary-v1" as const;

export const GLYPH_STATIC_BOUNDARY_ELEMENTS = [
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "header",
  "li",
  "main",
  "ol",
  "p",
  "section",
  "span",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

export type GlyphStaticBoundaryElement =
  (typeof GLYPH_STATIC_BOUNDARY_ELEMENTS)[number];

export interface GlyphStaticBoundaryAttributes {
  readonly "data-glyphscramble-font": string;
  readonly "data-glyphscramble-source": typeof GLYPH_STATIC_BOUNDARY_SOURCE;
}

export function isGlyphStaticBoundaryElement(
  value: unknown,
): value is GlyphStaticBoundaryElement {
  return (
    typeof value === "string" &&
    (GLYPH_STATIC_BOUNDARY_ELEMENTS as readonly string[]).includes(value)
  );
}

/**
 * Emits the framework-neutral marker consumed by the post-build static
 * compiler. It does not scramble text and is unsafe in hydrated output.
 */
export function glyphStaticBoundaryAttributes(
  font: string,
): GlyphStaticBoundaryAttributes {
  if (!/^[a-z][a-z0-9_-]{0,31}$/iu.test(font))
    throw new TypeError(
      "GlyphStaticBoundary `font` must be a configured GlyphScramble font id.",
    );
  return Object.freeze({
    "data-glyphscramble-font": font,
    "data-glyphscramble-source": GLYPH_STATIC_BOUNDARY_SOURCE,
  });
}
