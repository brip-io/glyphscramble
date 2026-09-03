export const GLYPH_FONT_REPAIR_URL =
  "https://github.com/brip-io/glyphscramble/blob/main/docs/FONT-SOURCES.md#repairing-rejected-fonts";

export type GlyphFontErrorCode =
  | "GLYPH_FONT_COLLECTION_UNSUPPORTED"
  | "GLYPH_FONT_CONTAINER_INVALID"
  | "GLYPH_FONT_CMAP_INVALID"
  | "GLYPH_FONT_COVERAGE_INVALID"
  | "GLYPH_FONT_VALIDATION_FAILED";

function classify(message: string): GlyphFontErrorCode {
  if (/TTC|collection/i.test(message))
    return "GLYPH_FONT_COLLECTION_UNSUPPORTED";
  if (/cmap/i.test(message)) return "GLYPH_FONT_CMAP_INVALID";
  if (/coverage|Unicode range/i.test(message))
    return "GLYPH_FONT_COVERAGE_INVALID";
  if (/WOFF|signature|sfnt|table|checksum|font/i.test(message))
    return "GLYPH_FONT_CONTAINER_INVALID";
  return "GLYPH_FONT_VALIDATION_FAILED";
}

/** Actionable validation failure for a configured family/face. */
export class GlyphFontError extends Error {
  readonly code: GlyphFontErrorCode;
  readonly target: string;
  readonly remediation = GLYPH_FONT_REPAIR_URL;

  constructor(target: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const code = classify(detail);
    super(
      `GlyphScramble rejected font ${target}: ${detail} Validate or repair a copy with OTS/fonttools, then prepare it again. See ${GLYPH_FONT_REPAIR_URL}.`,
      { cause },
    );
    this.name = "GlyphFontError";
    this.code = code;
    this.target = target;
  }
}

export function asGlyphFontError(
  target: string,
  cause: unknown,
): GlyphFontError {
  return cause instanceof GlyphFontError
    ? cause
    : new GlyphFontError(target, cause);
}
