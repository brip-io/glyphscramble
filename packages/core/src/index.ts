export { defineGlyphConfig, validateGlyphConfig } from "./config.js";
export { createGlyphEngine, protectedResponseHeaders } from "./engine.js";
export {
  inspectFont,
  prepareGlyphFonts,
  summarizeCoverage,
} from "./font-pipeline.js";
export { buildStaticSite } from "./static-site.js";
export { buildCmap, parseCmap, parseVariationSequences } from "./cmap.js";
export type { VariationSequenceMap } from "./cmap.js";
export { buildSfnt, fontCodepoints, parseSfnt, remapCmap } from "./sfnt.js";
export {
  createPermutation,
  encodeText,
  isStructuralCodePoint,
  propertySignature,
  UNICODE_VERSION,
} from "./unicode.js";
export type {
  DoctorFinding,
  FontConfig,
  FontFaceMetadata,
  FontLicense,
  FontSource,
  GlyphConfig,
  GlyphEngine,
  GlyphLockfile,
  GlyphPayload,
  ResponseContext,
  ScrambleOptions,
} from "./types.js";
export type { StaticSiteOptions, StaticSiteResult } from "./static-site.js";
