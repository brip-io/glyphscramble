import type { GlyphConfig, GlyphConfigInput } from "./types.js";
import spdxParse from "spdx-expression-parse";
import { parseCoverage } from "./coverage.js";
import {
  assertStaticErrorText,
  assertTimerDelay,
  MAX_TIMER_DELAY_MS,
} from "./limits.js";

const HTTPS = /^https:\/\//i;
const MAX_NORMALIZED_BYTES = 16 * 1024 * 1024;
const MAX_RUNTIME_CACHE_BYTES = 1024 * 1024 * 1024;
const MAX_TOKEN_TTL_SECONDS = 86_400;
const MAX_STATIC_FONT_TIMEOUT_MS = 60_000;
const TOKEN_KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

export function defineGlyphConfig(config: GlyphConfigInput): GlyphConfig {
  const normalized: GlyphConfig = {
    ...config,
    rotation: {
      scope: config.rotation?.scope ?? "response",
      keyId: config.rotation?.keyId ?? "current",
      secretEnv: config.rotation?.secretEnv ?? "GLYPHSCRAMBLE_SECRET",
      ...(config.rotation?.previousKeys === undefined
        ? {}
        : { previousKeys: config.rotation.previousKeys }),
      tokenTtlSeconds: config.rotation?.tokenTtlSeconds ?? 600,
    },
    routePrefix: config.routePrefix ?? "/_glyphscramble",
    unsupported: config.unsupported ?? "error",
  };
  validateGlyphConfig(normalized);
  return normalized;
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
  if (!/^\/[a-z0-9._~%/-]*[a-z0-9._~%-]$/i.test(config.routePrefix)) {
    throw new Error(
      "routePrefix must be a root-relative URL path with no trailing slash, query, fragment, or encoded path separator.",
    );
  }
  if (/%(?:2f|5c)/i.test(config.routePrefix)) {
    throw new Error(
      "routePrefix must not contain an encoded slash or backslash.",
    );
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
  })) {
    if (value !== undefined)
      assertTimerDelay(value, `remote.${name}`, MAX_TIMER_DELAY_MS);
  }
  const remoteMaxBytes = config.remote?.maxBytes;
  if (
    remoteMaxBytes !== undefined &&
    (!Number.isSafeInteger(remoteMaxBytes) || remoteMaxBytes < 1)
  )
    throw new Error("remote.maxBytes must be a positive integer.");
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
    acquisitionTimeoutMs: config.runtime?.acquisitionTimeoutMs,
    acquisitionQueueLimit: config.runtime?.acquisitionQueueLimit,
    workerRecycleAfter: config.runtime?.workerRecycleAfter,
    drainTimeoutMs: config.runtime?.drainTimeoutMs,
    cacheMaxBytes: config.runtime?.cacheMaxBytes,
  };
  for (const [name, value] of Object.entries(runtimeIntegers)) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
      throw new Error(`runtime.${name} must be a positive integer.`);
  }
  for (const [name, value] of Object.entries({
    generationTimeoutMs: config.runtime?.generationTimeoutMs,
    acquisitionTimeoutMs: config.runtime?.acquisitionTimeoutMs,
    drainTimeoutMs: config.runtime?.drainTimeoutMs,
  })) {
    if (value !== undefined)
      assertTimerDelay(value, `runtime.${name}`, MAX_TIMER_DELAY_MS);
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
  const publicBasePath = config.static?.publicBasePath;
  if (publicBasePath !== undefined) {
    if (
      !/^\/(?:[a-z0-9._~%-]+(?:\/[a-z0-9._~%-]+)*)?\/?$/i.test(
        publicBasePath,
      ) ||
      /%(?:2f|5c)/i.test(publicBasePath) ||
      publicBasePath.split("/").some((part) => part === "." || part === "..")
    )
      throw new Error(
        "static.publicBasePath must be a root-relative URL path without a query, fragment, dot segment, or encoded separator.",
      );
  }
  const staticTimeout = config.static?.fontLoadTimeoutMs;
  if (
    staticTimeout !== undefined &&
    (!Number.isSafeInteger(staticTimeout) ||
      staticTimeout < 1 ||
      staticTimeout > MAX_STATIC_FONT_TIMEOUT_MS)
  )
    throw new Error(
      `static.fontLoadTimeoutMs must be a positive integer no greater than ${MAX_STATIC_FONT_TIMEOUT_MS}.`,
    );
  if (
    config.static?.fontFailure !== undefined &&
    config.static.fontFailure !== "generic-error"
  )
    throw new Error("static.fontFailure must be generic-error.");
  if (config.static?.errorText !== undefined)
    assertStaticErrorText(config.static.errorText);
  const entries = Object.entries(config.fonts);
  if (entries.length === 0)
    throw new Error("At least one font must be configured.");
  for (const [id, font] of entries) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(id))
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
      if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(faceId))
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
