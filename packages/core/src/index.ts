export { defineGlyphConfig, validateGlyphConfig } from "./config.js";
export { discoverGlyphConfigPath, loadGlyphConfig } from "./config-loader.js";
export { doctorProject } from "./doctor.js";
export {
  configTemplate,
  detectFramework,
  detectPackageManager,
  initProject,
} from "./init.js";
export type {
  GlyphDeliveryMode,
  GlyphFramework,
  GlyphPackageManager,
  InitCommand,
  InitCommandRunner,
  InitProjectOptions,
  InitResult,
} from "./init.js";
export { PACKAGE_VERSION } from "./generated/version.js";
export {
  GLYPH_CONTENT_REPAIR_URL,
  GlyphContentError,
} from "./content-error.js";
export { GLYPH_FONT_REPAIR_URL, GlyphFontError } from "./font-error.js";
export type { GlyphFontErrorCode } from "./font-error.js";
export {
  MAX_COVERAGE_RANGES,
  MAX_COVERAGE_RANGE_BYTES,
  MAX_GLYPH_PAYLOAD_BYTES,
  MAX_STATIC_ERROR_TEXT_BYTES,
  MAX_TIMER_DELAY_MS,
} from "./limits.js";
export {
  DEFAULT_STATIC_IO_CONCURRENCY,
  MAX_STATIC_IO_CONCURRENCY,
} from "./bounded-tasks.js";
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
export { MAX_TOKEN_FACES } from "./token.js";
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
  assertTextSupported,
  createPermutation,
  createPermutationFromPlan,
  createPermutationPlan,
  encodeText,
  isStructuralCodePoint,
  PERMUTATION_ALGORITHM,
  propertySignature,
  UNICODE_VERSION,
  UnsupportedTextError,
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
  GlyphProtectionResult,
  GlyphResponseFace,
  GlyphResponseOptions,
  GlyphContentDiagnostic,
  GlyphPayloadCoverage,
  GlyphPayloadFace,
  GlyphRuntimeEvent,
  GlyphRuntimeEventCode,
  GlyphRuntimeEventHandler,
  PreparedFontFamilyMetadata,
  ResponseContext,
  ResponseUsage,
  OptionalScrambleOptions,
  ScrambleOptions,
} from "./types.js";
