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

export interface FontConfig {
  source: FontSource;
  license: FontLicense;
  /** Explicit Unicode ranges, for example `U+0000-00FF`. */
  coverage?: readonly string[];
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
  readonly fontToken: string;
  readonly family: string;
  readonly fontUrl: string;
  readonly coverage: readonly string[];
  readonly css: string;
  readonly cspNonce?: string;
}

export interface ScrambleOptions {
  font: string;
  lang?: string;
  cspNonce?: string;
}

export interface ResponseContext {
  readonly token: string;
  scramble(text: string, options: ScrambleOptions): GlyphPayload;
}

export interface FontFaceMetadata {
  id: string;
  sourceUrl?: string;
  sha256: string;
  flavor: "truetype" | "cff" | "woff" | "woff2";
  bytes: number;
  codepoints: readonly number[];
  tables: readonly string[];
  variable: boolean;
  color: boolean;
}

export interface GlyphLockfile {
  version: 1;
  unicodeVersion: "17.0.0";
  generatedAt: string;
  fonts: Record<
    string,
    FontFaceMetadata & {
      source: FontSource;
      license: FontLicense;
      coverage: readonly string[];
    }
  >;
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
