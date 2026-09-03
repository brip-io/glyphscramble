import type { GlyphConfig } from "./types.js";
import spdxParse from "spdx-expression-parse";
import { parseCoverage } from "./coverage.js";

const HTTPS = /^https:\/\//i;
const MAX_NORMALIZED_BYTES = 16 * 1024 * 1024;
const MAX_RUNTIME_CACHE_BYTES = 1024 * 1024 * 1024;
const MAX_TOKEN_TTL_SECONDS = 86_400;
const TOKEN_KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

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
    config.rotation.tokenTtlSeconds < 1 ||
    config.rotation.tokenTtlSeconds > MAX_TOKEN_TTL_SECONDS
  ) {
    throw new Error(
      `rotation.tokenTtlSeconds must be a positive integer no greater than ${MAX_TOKEN_TTL_SECONDS}.`,
    );
  }
  const currentKeyId = config.rotation.keyId ?? "current";
  if (!TOKEN_KEY_ID.test(currentKeyId))
    throw new Error(`Invalid rotation.keyId: ${currentKeyId}`);
  if (!config.rotation.secretEnv)
    throw new Error(
      "rotation.secretEnv must name the current secret variable.",
    );
  const previousKeys = config.rotation.previousKeys ?? [];
  if (previousKeys.length > 3)
    throw new Error("rotation.previousKeys accepts at most three keys.");
  const keyIds = new Set([currentKeyId]);
  for (const key of previousKeys) {
    if (!TOKEN_KEY_ID.test(key.id))
      throw new Error(`Invalid previous token key id: ${key.id}`);
    if (!key.secretEnv)
      throw new Error(`Previous token key ${key.id} must name a secretEnv.`);
    if (keyIds.has(key.id))
      throw new Error(`Duplicate GlyphScramble token key id: ${key.id}`);
    keyIds.add(key.id);
  }
  if (!config.routePrefix.startsWith("/") || config.routePrefix.endsWith("/")) {
    throw new Error("routePrefix must begin with, and not end with, '/'.");
  }
  if (
    config.maxNormalizedBytes !== undefined &&
    (!Number.isSafeInteger(config.maxNormalizedBytes) ||
      config.maxNormalizedBytes < 1 ||
      config.maxNormalizedBytes > MAX_NORMALIZED_BYTES)
  )
    throw new Error(
      `maxNormalizedBytes must be a positive integer no greater than ${MAX_NORMALIZED_BYTES}.`,
    );
  for (const [name, value] of Object.entries({
    timeoutMs: config.remote?.timeoutMs,
    totalTimeoutMs: config.remote?.totalTimeoutMs,
    maxBytes: config.remote?.maxBytes,
  })) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
      throw new Error(`remote.${name} must be a positive integer.`);
  }
  const maxRedirects = config.remote?.maxRedirects;
  if (
    maxRedirects !== undefined &&
    (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0)
  )
    throw new Error("remote.maxRedirects must be a non-negative integer.");
  const runtimeIntegers = {
    poolLowWatermark: config.runtime?.poolLowWatermark,
    poolHighWatermark: config.runtime?.poolHighWatermark,
    generationConcurrency: config.runtime?.generationConcurrency,
    generationQueueLimit: config.runtime?.generationQueueLimit,
    generationTimeoutMs: config.runtime?.generationTimeoutMs,
    cacheMaxBytes: config.runtime?.cacheMaxBytes,
  };
  for (const [name, value] of Object.entries(runtimeIntegers)) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
      throw new Error(`runtime.${name} must be a positive integer.`);
  }
  if (
    config.runtime?.cacheMaxBytes !== undefined &&
    config.runtime.cacheMaxBytes > MAX_RUNTIME_CACHE_BYTES
  )
    throw new Error(
      `runtime.cacheMaxBytes must be no greater than ${MAX_RUNTIME_CACHE_BYTES}.`,
    );
  if (
    (config.runtime?.poolLowWatermark ?? 2) >
    (config.runtime?.poolHighWatermark ?? 4)
  )
    throw new Error(
      "runtime.poolLowWatermark must not exceed runtime.poolHighWatermark.",
    );
  if (
    config.runtime?.variantMode !== undefined &&
    config.runtime.variantMode !== "response-pool"
  )
    throw new Error(
      "runtime.variantMode must be response-pool; reusable window rotation is not supported.",
    );
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
    try {
      spdxParse(font.license.spdx);
    } catch {
      throw new Error(`Font ${id} has an invalid SPDX license expression.`);
    }
    if (font.coverage) parseCoverage(font.coverage);
    const faces = Object.entries(font.faces ?? {});
    for (const [faceId, selector] of faces) {
      if (!/^[a-z][a-z0-9_-]*$/i.test(faceId))
        throw new Error(`Invalid face id ${faceId} for font ${id}.`);
      if (selector.coverage) parseCoverage(selector.coverage);
    }
    if (font.defaultFace && !font.faces?.[font.defaultFace])
      throw new Error(
        `Font ${id} defaultFace ${font.defaultFace} is not present in faces.`,
      );
    if (faces.length > 1 && !font.defaultFace)
      throw new Error(`Font ${id} with multiple faces requires defaultFace.`);
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
