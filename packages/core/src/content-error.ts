export const GLYPH_CONTENT_REPAIR_URL =
  "https://github.com/brip-io/glyphscramble/blob/main/docs/USAGE-GUIDE.md#unsupported-content";

export type GlyphNormalizationState = "nfc" | "not-nfc";

export interface GlyphContentDiagnostic {
  readonly code: "GLYPH_CONTENT_UNSUPPORTED";
  readonly codepoint: string;
  readonly normalization: GlyphNormalizationState;
  readonly font: string;
  readonly face: string;
  readonly remediation: string;
}

/** Safe, content-free details for one block that cannot be protected. */
export class GlyphContentError extends Error {
  readonly code = "GLYPH_CONTENT_UNSUPPORTED" as const;
  readonly codepoint: string;
  readonly normalization: GlyphNormalizationState;
  readonly font: string;
  readonly face: string;
  readonly remediation = GLYPH_CONTENT_REPAIR_URL;

  constructor(options: {
    codepoint: number;
    normalization: GlyphNormalizationState;
    font: string;
    face: string;
  }) {
    const codepoint = `U+${options.codepoint
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")}`;
    super(
      `GlyphScramble cannot protect ${codepoint} with ${options.font}.${options.face} (${options.normalization}). Normalize the source to NFC or prepare a face whose configured coverage contains this code point. See ${GLYPH_CONTENT_REPAIR_URL}.`,
    );
    this.name = "GlyphContentError";
    this.codepoint = codepoint;
    this.normalization = options.normalization;
    this.font = options.font;
    this.face = options.face;
  }

  diagnostic(): GlyphContentDiagnostic {
    return Object.freeze({
      code: this.code,
      codepoint: this.codepoint,
      normalization: this.normalization,
      font: this.font,
      face: this.face,
      remediation: this.remediation,
    });
  }
}
