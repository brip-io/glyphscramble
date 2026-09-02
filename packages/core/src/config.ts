import type { GlyphConfig } from "./types.js";

const HTTPS = /^https:\/\//i;

export function defineGlyphConfig<const T extends GlyphConfig>(config: T): T {
  validateGlyphConfig(config);
  return config;
}

export function validateGlyphConfig(config: GlyphConfig): void {
  if (!config.accessibilityRiskAcknowledged) {
    throw new Error(
      "GlyphScramble hides protected text from assistive technology. Set accessibilityRiskAcknowledged: true only for non-essential, opted-in content.",
    );
  }
  if (config.rotation.scope !== "response") {
    throw new Error("Only per-response rotation is supported.");
  }
  if (
    !Number.isInteger(config.rotation.tokenTtlSeconds) ||
    config.rotation.tokenTtlSeconds < 1
  ) {
    throw new Error("rotation.tokenTtlSeconds must be a positive integer.");
  }
  if (!config.routePrefix.startsWith("/") || config.routePrefix.endsWith("/")) {
    throw new Error("routePrefix must begin with, and not end with, '/'.");
  }
  const entries = Object.entries(config.fonts);
  if (entries.length === 0)
    throw new Error("At least one font must be configured.");
  for (const [id, font] of entries) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(id))
      throw new Error(`Invalid font id: ${id}`);
    if (!font.license.spdx || !font.license.file) {
      throw new Error(
        `Font ${id} requires an SPDX expression and license file.`,
      );
    }
    if (font.source.kind !== "file" && !HTTPS.test(font.source.url)) {
      throw new Error(`Remote font ${id} must use HTTPS.`);
    }
    if (
      font.source.kind === "google-css" &&
      !/^https:\/\/fonts\.googleapis\.com\//i.test(font.source.url)
    ) {
      throw new Error(`google-css source ${id} must use fonts.googleapis.com.`);
    }
  }
}
