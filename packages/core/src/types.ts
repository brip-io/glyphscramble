export type FontSource =
  | { kind: "file"; path: string }
  | { kind: "url"; url: string }
  | { kind: "google-css"; url: string };

export interface FontLicense {
  /** SPDX expression supplied by the publisher. GlyphScramble does not relicense fonts. */
  spdx: string;
  /** A notice or license file that will be copied beside generated artifacts. */
  file: string;
}

export interface FontFaceSelector {
  /** Stable face id is the key in `FontConfig.faces`. */
  family?: string;
  weight?: number | string;
  style?: string;
  stretch?: string;
  /** Narrows both CSS face selection and runtime permutation coverage. */
  coverage?: readonly string[];
}

export interface FontConfig {
  source: FontSource;
  license: FontLicense;
  /** Explicit Unicode ranges, for example `U+0000-00FF`. */
  coverage?: readonly string[];
  /**
   * Explicit faces to select from CSS. Local/direct sources accept at most one
   * entry, which may override inferred CSS descriptors.
   */
  faces?: Readonly<Record<string, FontFaceSelector>>;
  /** Defaults to the only selected face, or requires an explicit value. */
  defaultFace?: string;
  /** Required to process a normalized face larger than maxNormalizedBytes. */
  allowLargeFont?: boolean;
}

export interface GlyphConfig {
  fonts: Readonly<Record<string, FontConfig>>;
  rotation: {
    scope: "response";
    /** Stable identifier embedded in v2 tokens; change it when rotating secrets. */
    keyId?: string;
    secretEnv: string;
    /** Decryption-only keys retained for tokens issued before a rotation. */
    previousKeys?: readonly {
      id: string;
      secretEnv: string;
    }[];
    tokenTtlSeconds: number;
  };
  routePrefix: `/${string}`;
  unsupported: "error";
  accessibilityRiskAcknowledged: true;
  /** Publisher policy threshold, capped by the 16 MiB parser ceiling in 0.1. */
  maxNormalizedBytes?: number;
  remote?: {
    timeoutMs?: number;
    totalTimeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    /** Explicit opt-out for controlled build networks; false by default. */
    allowPrivateHosts?: boolean;
  };
  /** Runtime limits for one-use response font variants. */
  runtime?: {
    /** The beta runtime never silently downgrades to a reusable mapping. */
    variantMode?: "response-pool";
    /** Variants synchronously available before a protected response begins. */
    poolLowWatermark?: number;
    /** Maximum ready variants retained ahead of demand. */
    poolHighWatermark?: number;
    /** Maximum font-generation jobs running at once. */
    generationConcurrency?: number;
    /** Maximum jobs waiting behind active generators. */
    generationQueueLimit?: number;
    /** Per-face generation deadline. */
    generationTimeoutMs?: number;
    /** Maximum default wait for the next prepared response variant. */
    acquisitionTimeoutMs?: number;
    /** Maximum protected responses waiting for a prepared variant. */
    acquisitionQueueLimit?: number;
    /** Recycle a persistent compression worker after this many jobs. */
    workerRecycleAfter?: number;
    /** Maximum graceful-drain wait before live variants are released. */
    drainTimeoutMs?: number;
    /** Combined byte ceiling for ready and issued WOFF2 variants and mappings. */
    cacheMaxBytes?: number;
  };
  /** Build-time delivery policy for the reusable static mapping fallback. */
  static?: {
    /** Root-relative deployment path, for example `/` or `/docs`. */
    publicBasePath?: `/${string}`;
    /** Maximum wait before the generic fail-closed status is shown. */
    fontLoadTimeoutMs?: number;
    /** Static output never substitutes plaintext after a font failure. */
    fontFailure?: "generic-error";
    /** Localized generic status; it must never contain the protected text. */
    errorText?: string;
  };
}

/**
 * Publisher-facing configuration. Stable operational values are optional here
 * and normalized by `defineGlyphConfig`; safety acknowledgements and font
 * licensing remain explicit.
 */
export interface GlyphConfigInput extends Omit<
  GlyphConfig,
  "rotation" | "routePrefix" | "unsupported"
> {
  rotation?: {
    scope?: "response";
    keyId?: string;
    secretEnv?: string;
    previousKeys?: readonly {
      id: string;
      secretEnv: string;
    }[];
    tokenTtlSeconds?: number;
  };
  routePrefix?: `/${string}`;
  unsupported?: "error";
}

declare const glyphPayloadBrand: unique symbol;

export interface GlyphPayloadFace {
  readonly id: string;
  readonly family: string;
  readonly weight: string;
  readonly style: string;
  readonly stretch: string;
  readonly unicodeRange: readonly string[];
}

/** Stable identity of the prepared face descriptors and allowed coverage. */
export type GlyphPayloadCoverage = string;

export interface GlyphPayload {
  readonly [glyphPayloadBrand]: true;
  readonly version: 3;
  readonly encodedText: string;
  readonly font: string;
  readonly face: GlyphPayloadFace;
  readonly fontUrl: string;
  /** Unix time in seconds after which this response mapping must not render. */
  readonly expiresAt: number;
  readonly coverage: GlyphPayloadCoverage;
  readonly lang?: string;
  readonly cspNonce?: string;
}

export interface ScrambleOptions {
  font: string;
  face?: string;
  lang?: string;
  cspNonce?: string;
}

export interface OptionalScrambleOptions extends ScrambleOptions {
  /** Explicit per-block opt-in: omit unsupported content instead of throwing. */
  unsupported: "omit";
}

export interface GlyphContentDiagnostic {
  readonly code: "GLYPH_CONTENT_UNSUPPORTED";
  readonly codepoint: string;
  readonly normalization: "nfc" | "not-nfc";
  readonly font: string;
  readonly face: string;
  readonly remediation: string;
}

export type GlyphProtectionResult =
  | { readonly status: "protected"; readonly payload: GlyphPayload }
  | { readonly status: "omitted"; readonly error: GlyphContentDiagnostic };

export interface ResponseContext {
  /** True only after at least one protected payload has been emitted. */
  readonly used: boolean;
  usage(): ResponseUsage;
  scramble(text: string, options: ScrambleOptions): GlyphPayload;
  /** Wait briefly for a prepared one-use variant, then fail closed. */
  scrambleAsync(
    text: string,
    options: ScrambleOptions,
    acquisition?: GlyphAcquisitionOptions,
  ): Promise<GlyphPayload>;
  /** Explicit optional-block boundary. Omitted results never contain plaintext. */
  protect(
    text: string,
    options: OptionalScrambleOptions,
  ): GlyphProtectionResult;
  /** Async optional-block boundary with the same no-plaintext result contract. */
  protectAsync(
    text: string,
    options: OptionalScrambleOptions,
    acquisition?: GlyphAcquisitionOptions,
  ): Promise<GlyphProtectionResult>;
}

export interface GlyphAcquisitionOptions {
  /** Overrides runtime.acquisitionTimeoutMs for this protected response. */
  readonly timeoutMs?: number;
  /** Cancels a queued wait when the originating request is abandoned. */
  readonly signal?: AbortSignal;
}

export interface GlyphResponseFace {
  readonly font: string;
  /** Defaults to the configured default face for this family. */
  readonly face?: string;
}

export interface GlyphResponseOptions extends GlyphAcquisitionOptions {
  /**
   * Prepared faces authorized by this response's stable token. Omit to
   * authorize the bounded configured set. An explicit list narrows scope.
   */
  readonly faces?: readonly GlyphResponseFace[];
}

export interface GlyphDrainOptions {
  /** Overrides runtime.drainTimeoutMs. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export type GlyphRuntimeEventCode =
  | "pool-depth"
  | "acquisition-wait"
  | "pool-exhausted"
  | "pool-recovered"
  | "generation-failed"
  | "generation-timeout"
  | "variant-expired"
  | "drain-started"
  | "drain-complete";

/** Aggregate-only operational event. It never contains content or token data. */
export interface GlyphRuntimeEvent {
  readonly code: GlyphRuntimeEventCode;
  readonly timestamp: number;
  readonly readyVariants: number;
  readonly activeVariants: number;
  readonly queueDepth: number;
  readonly waitingRequests: number;
  readonly durationMs?: number;
  readonly errorClass?: string;
}

export type GlyphRuntimeEventHandler = (event: GlyphRuntimeEvent) => void;

export interface GlyphCapacityReport {
  readonly faceCount: number;
  /** Logical CPU parallelism visible to this process. */
  readonly hostParallelism: number;
  readonly generationConcurrency: number;
  readonly readyBurst: number;
  readonly cacheMaxBytes: number;
  readonly estimatedVariantBytes: number;
  readonly cacheLimitedResponses: number;
  readonly tokenTtlSeconds: number;
  readonly measuredFaceGenerationP95Ms: number;
  readonly sustainableResponsesPerSecond: number;
  readonly sustainableResponsesPerTtl: number;
  readonly estimatedBytesAtSustainableRate: number;
  readonly targetResponsesPerSecond?: number;
  readonly targetFitsGeneration?: boolean;
  readonly targetFitsCache?: boolean;
  readonly guidance: readonly string[];
}

export interface ResponseUsage {
  readonly used: boolean;
  /** Stable token scope after the first protected block is emitted. */
  readonly authorizedFaces: readonly string[];
  /** Faces actually referenced by emitted payloads. */
  readonly usedFaces: readonly string[];
  /** Opaque one-use provider identity; never log or expose it to clients. */
  readonly variantId?: string;
}

export interface GlyphEngineMetrics {
  readonly variantMode: "response-pool";
  readonly leasesIssued: number;
  readonly poolExhaustions: number;
  readonly fontHits: number;
  readonly fontMisses: number;
  readonly generations: number;
  readonly generationFailures: number;
  readonly generationTimeouts: number;
  readonly generationCancellations: number;
  readonly generationOverloads: number;
  readonly acquisitionWaits: number;
  readonly acquisitionTimeouts: number;
  readonly acquisitionCancellations: number;
  readonly expiredVariants: number;
  readonly capacityDrops: number;
  readonly readyVariants: number;
  readonly activeVariants: number;
  readonly cacheBytes: number;
  readonly queueDepth: number;
  readonly activeGenerators: number;
  readonly waitingRequests: number;
  readonly draining: boolean;
  readonly workerRestarts: number;
  readonly estimatedVariantBytes: number;
  readonly generationMilliseconds: {
    readonly count: number;
    readonly total: number;
    readonly max: number;
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    /** Bounded recent raw samples for capacity analysis and CI evidence. */
    readonly samples: readonly number[];
  };
}

export interface FontAxisMetadata {
  tag: string;
  min: number;
  default: number;
  max: number;
}

export interface FontFaceDescriptors {
  family: string;
  weight: string;
  style: string;
  stretch: string;
  unicodeRange: readonly string[];
}

export interface FontFaceMetadata {
  id: string;
  familyId: string;
  /** Stable identity of normalized bytes, effective descriptors, and coverage. */
  identity: string;
  sourceUrl?: string;
  sourceSha256: string;
  sha256: string;
  container: "sfnt" | "woff" | "woff2";
  flavor: "truetype" | "cff";
  bytes: number;
  codepoints: readonly number[];
  coverage: readonly string[];
  tables: readonly string[];
  variable: boolean;
  color: boolean;
  /** Descriptors declared by CSS or inferred from the unmodified source. */
  sourceDescriptors: FontFaceDescriptors;
  /** Effective descriptors used by generated runtime CSS. */
  descriptors: FontFaceDescriptors;
  names: {
    family?: string;
    subfamily?: string;
    postscript?: string;
  };
  axes: readonly FontAxisMetadata[];
  features: readonly string[];
}

export interface PreparedFontFamilyMetadata {
  id: string;
  source: FontSource;
  sourceUrl?: string;
  sourceSha256?: string;
  requestProfile?: "google-fonts-woff2-v1";
  defaultFace: string;
  license: FontLicense & {
    noticeFile: string;
    noticeSha256: string;
  };
  faces: Record<string, FontFaceMetadata>;
}

export interface GlyphLockfile {
  version: 2;
  toolVersion: string;
  unicodeVersion: "17.0.0";
  generatedAt: string;
  fonts: Record<string, PreparedFontFamilyMetadata>;
}

export interface GlyphEngine {
  beginResponse(options?: GlyphResponseOptions): ResponseContext;
  fontResponse(request: Request): Promise<Response>;
  metrics(): GlyphEngineMetrics;
  capacityReport(targetResponsesPerSecond?: number): GlyphCapacityReport;
  /** Stop new leases, retain issued fonts until expiry/deadline, then close. */
  drain(options?: GlyphDrainOptions): Promise<void>;
  close(): Promise<void>;
}

export interface DoctorFinding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
}
