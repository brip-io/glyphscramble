import {
  createGlyphEngine,
  protectedResponseHeaders,
  type GlyphConfig,
  type ResponseContext,
} from "@brip/glyphscramble";

export { GlyphScramble } from "@brip/glyphscramble-vue";

export interface GlyphNitroEvent {
  request: Request;
  context: { glyphscramble?: ResponseContext };
}

export async function createNuxtGlyphs(
  config: GlyphConfig,
  options: { cwd?: string } = {},
) {
  const engine = await createGlyphEngine(config, options);
  return {
    engine,
    async middleware(
      event: GlyphNitroEvent,
      next: () => Promise<Response>,
    ): Promise<Response> {
      if (
        new URL(event.request.url).pathname.startsWith(
          `${config.routePrefix}/font/`,
        )
      )
        return engine.fontResponse(event.request);
      event.context.glyphscramble = engine.beginResponse();
      const response = await next();
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: protectedResponseHeaders(response.headers),
      });
    },
  } as const;
}
