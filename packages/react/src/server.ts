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
