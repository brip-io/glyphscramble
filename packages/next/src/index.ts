import {
  createGlyphEngine,
  protectedResponseHeaders,
  type GlyphConfig,
} from "@brip/glyphscramble";

export { GlyphScramble } from "@brip/glyphscramble-react";
export { createGlyphPayload } from "@brip/glyphscramble-react/server";

export async function createNextGlyphs(
  config: GlyphConfig,
  options: { cwd?: string } = {},
) {
  const engine = await createGlyphEngine(config, options);
  return {
    engine,
    beginResponse: () => engine.beginResponse(),
    /** Export as GET and HEAD from `app/_glyphscramble/font/[token]/[face]/route.ts`. */
    fontRoute: (request: Request) => engine.fontResponse(request),
    /** Apply to HTML/RSC responses in generated proxy.ts. */
    responseHeaders: (headers?: HeadersInit) =>
      protectedResponseHeaders(headers),
  } as const;
}

export function markNextRequestHeaders(input: HeadersInit = {}): Headers {
  const headers = protectedResponseHeaders(input);
  headers.set("x-glyphscramble-request", crypto.randomUUID());
  return headers;
}
