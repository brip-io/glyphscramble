export { defineGlyphConfig, validateGlyphConfig } from "./config.js";
export {
  createGlyphEngine,
  protectedResponseHeaders,
  responseHeadersForContext,
} from "./engine.js";
export {
  DEFAULT_VARIANT_RUNTIME,
  VariantDrainingError,
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
  loadPreparedFontFamilies,
  loadPreparedFonts,
  parseCssFontFaces,
  prepareGlyphFonts,
  summarizeCoverage,
} from "./font-pipeline.js";
export {
  buildStaticSite,
  STATIC_BUILD_WARNING,
  staticGlyphCspDirectives,
  verifyStaticOutput,
} from "./static-output.js";
export type {
  StaticBuildManifest,
  StaticGlyphCspDirectives,
  StaticManifestAsset,
  StaticManifestHtmlFile,
  StaticSiteOptions,
  StaticSiteResult,
} from "./static-output.js";
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
  compactEncodeMapping,
  createPermutation,
  createPermutationFromPlan,
  createPermutationPlan,
  encodeText,
  isStructuralCodePoint,
  PERMUTATION_ALGORITHM,
  propertySignature,
  UNICODE_VERSION,
} from "./unicode.js";
export type {
  CodePointMapping,
  Permutation,
  PermutationPlan,
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
  GlyphConfigInput,
  GlyphAcquisitionOptions,
  GlyphCapacityReport,
  GlyphDrainOptions,
  GlyphEngine,
  GlyphEngineMetrics,
  GlyphLockfile,
  GlyphPayload,
  GlyphPayloadCoverage,
  GlyphPayloadFace,
  GlyphRuntimeEvent,
  GlyphRuntimeEventCode,
  GlyphRuntimeEventHandler,
  PreparedFontFamilyMetadata,
  ResponseContext,
  ResponseUsage,
  ScrambleOptions,
} from "./types.js";
