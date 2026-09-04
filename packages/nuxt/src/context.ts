import type { ResponseContext } from "@brip/glyphscramble";

export interface GlyphRequestEvent {
  readonly context: { readonly glyphscramble?: ResponseContext };
}

/** Return the request-local context installed by the Nuxt module. */
export function useGlyphScramble(
  event: GlyphRequestEvent | null | undefined,
): ResponseContext {
  const context = event?.context.glyphscramble;
  if (!context)
    throw new Error(
      "GlyphScramble has no request context. Call useGlyphScramble(useRequestEvent()) during server rendering and ensure @brip/glyphscramble-nuxt/module is installed.",
    );
  return context;
}
