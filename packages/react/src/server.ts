import "server-only";

import type {
  GlyphAcquisitionOptions,
  GlyphPayload,
  GlyphProtectionResult,
  OptionalScrambleOptions,
  ResponseContext,
  ScrambleOptions,
} from "@brip/glyphscramble";

/** Server-only boundary: plaintext is converted before it reaches a Client Component. */
export function createGlyphPayload(
  context: ResponseContext,
  plaintext: string,
  options: ScrambleOptions,
): GlyphPayload {
  return context.scramble(plaintext, options);
}

/** Server-only optional-block boundary. Omitted results contain diagnostics, never plaintext. */
export function protectGlyphBlock(
  context: ResponseContext,
  plaintext: string,
  options: OptionalScrambleOptions,
): GlyphProtectionResult {
  return context.protect(plaintext, options);
}

/** Async server-only optional-block boundary for bounded-wait runtimes. */
export function protectGlyphBlockAsync(
  context: ResponseContext,
  plaintext: string,
  options: OptionalScrambleOptions,
  acquisition?: GlyphAcquisitionOptions,
): Promise<GlyphProtectionResult> {
  return context.protectAsync(plaintext, options, acquisition);
}

/** Server-only bounded-wait boundary for burst-tolerant runtimes. */
export function createGlyphPayloadAsync(
  context: ResponseContext,
  plaintext: string,
  options: ScrambleOptions,
): Promise<GlyphPayload> {
  return context.scrambleAsync(plaintext, options);
}
