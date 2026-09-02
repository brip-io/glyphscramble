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
    secretEnv: string;
    tokenTtlSeconds: number;
  };
  routePrefix: `/${string}`;
  unsupported: "error";
  accessibilityRiskAcknowledged: true;
  maxNormalizedBytes?: number;
  remote?: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  };
}

declare const glyphPayloadBrand: unique symbol;

export interface GlyphPayload {
  readonly [glyphPayloadBrand]: true;
  readonly version: 1;
  readonly encodedText: string;
  readonly font: string;
  readonly face: string;
  readonly fontToken: string;
  readonly family: string;
  readonly fontUrl: string;
  readonly coverage: readonly string[];
  readonly css: string;
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
  scramble(text: string, options: ScrambleOptions): GlyphPayload;
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
  close(): Promise<void>;
}

export interface DoctorFinding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
}
