export { defineGlyphConfig, validateGlyphConfig } from "./config.js";
export { createGlyphEngine, protectedResponseHeaders } from "./engine.js";
export {
  DEFAULT_VARIANT_RUNTIME,
  ResponsePoolVariantProvider,
  VariantCancelledError,
  VariantOverloadError,
  VariantTimeoutError,
  VariantUnavailableError,
  variantRuntimeOptions,
} from "./variant-provider.js";
export type {
  FontVariantLease,
  FontVariantProvider,
  VariantFace,
  VariantGenerator,
  VariantProviderOptions,
} from "./variant-provider.js";
export {
  inspectFont,
  loadPreparedFont,
  loadPreparedFonts,
  parseCssFontFaces,
  prepareGlyphFonts,
  summarizeCoverage,
} from "./font-pipeline.js";
export { buildStaticSite, STATIC_BUILD_WARNING } from "./static-site.js";
export type {
  StaticBuildManifest,
  StaticManifestHtmlFile,
  StaticSiteOptions,
  StaticSiteResult,
} from "./static-site.js";
export {
  DEFAULT_STATIC_HYDRATION_DETECTORS,
  StaticBuildPlanError,
  StaticBuildPlanner,
} from "./static-plan.js";
export type {
  StaticBuildPlan,
  StaticBuildPlannerOptions,
  StaticElementSnapshot,
  StaticHydrationDetector,
  StaticPlannedFile,
  StaticPlanWarning,
} from "./static-plan.js";
export { buildCmap, parseCmap, parseVariationSequences } from "./cmap.js";
export type { VariationSequenceMap } from "./cmap.js";
export {
  buildSfnt,
  DEFAULT_FONT_PARSE_LIMITS,
  fontCodepoints,
  parseSfnt,
  remapCmap,
  woff2DeclaredSize,
} from "./sfnt.js";
export type { FontParseLimits, SfntFont, SfntTable } from "./sfnt.js";
export { assertRemoteDestination, fetchBounded } from "./remote.js";
export type {
  BoundedFetchOptions,
  FetchedResource,
  HostResolver,
} from "./remote.js";
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
  FontAxisMetadata,
  FontFaceDescriptors,
  FontFaceMetadata,
  FontFaceSelector,
  FontLicense,
  FontSource,
  GlyphConfig,
  GlyphEngine,
  GlyphEngineMetrics,
  GlyphLockfile,
  GlyphPayload,
  PreparedFontFamilyMetadata,
  ResponseContext,
  ScrambleOptions,
} from "./types.js";
