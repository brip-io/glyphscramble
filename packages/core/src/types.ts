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
    /** Combined byte ceiling for ready and issued WOFF2 variants. */
    cacheMaxBytes?: number;
  };
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

export interface GlyphPayloadCoverage {
  /** Stable identity of the prepared face descriptors and allowed coverage. */
  readonly identity: string;
  readonly ranges: readonly string[];
}

export interface GlyphPayload {
  readonly [glyphPayloadBrand]: true;
  readonly version: 2;
  readonly encodedText: string;
  readonly font: string;
  readonly face: GlyphPayloadFace;
  readonly fontToken: string;
  readonly fontUrl: string;
  readonly coverage: GlyphPayloadCoverage;
  readonly rotation: {
    readonly scope: "response";
    readonly variantMode: "response-pool";
    readonly reusableAcrossResponses: false;
  };
  readonly lang?: string;
  readonly cspNonce?: string;
}

export interface ScrambleOptions {
  font: string;
  face?: string;
  lang?: string;
  cspNonce?: string;
}

export interface ResponseContext {
  readonly token: string;
  /** True only after at least one protected payload has been emitted. */
  readonly used: boolean;
  usage(): ResponseUsage;
  scramble(text: string, options: ScrambleOptions): GlyphPayload;
}

export interface ResponseUsage {
  readonly used: boolean;
  readonly authorizedFaces: readonly string[];
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
  readonly expiredVariants: number;
  readonly capacityDrops: number;
  readonly readyVariants: number;
  readonly activeVariants: number;
  readonly cacheBytes: number;
  readonly queueDepth: number;
  readonly activeGenerators: number;
  readonly generationMilliseconds: {
    readonly count: number;
    readonly total: number;
    readonly max: number;
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
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
  toolVersion: "0.1.0-beta.0";
  unicodeVersion: "17.0.0";
  generatedAt: string;
  fonts: Record<string, PreparedFontFamilyMetadata>;
}

export interface GlyphEngine {
  beginResponse(): ResponseContext;
  fontResponse(request: Request): Promise<Response>;
  metrics(): GlyphEngineMetrics;
  close(): Promise<void>;
}

export interface DoctorFinding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
}
