import "server-only";

import type {
  GlyphPayload,
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

/** Server-only bounded-wait boundary for burst-tolerant runtimes. */
export function createGlyphPayloadAsync(
  context: ResponseContext,
  plaintext: string,
  options: ScrambleOptions,
): Promise<GlyphPayload> {
  return context.scrambleAsync(plaintext, options);
}
