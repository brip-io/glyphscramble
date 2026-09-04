import {
  createGlyphEngine,
  responseHeadersForContext,
  type GlyphConfig,
  type GlyphResponseFace,
  type ResponseContext,
} from "@brip/glyphscramble";

export { GlyphScramble } from "@brip/glyphscramble-vue";

export interface GlyphNitroEvent {
  request: Request;
  context: { glyphscramble?: ResponseContext };
}

export async function createNuxtGlyphs(
  config: GlyphConfig,
  options: { cwd?: string; faces?: readonly GlyphResponseFace[] } = {},
) {
  const engine = await createGlyphEngine(config, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  const beginResponse = (request: Request) =>
    engine.beginResponse({
      signal: request.signal,
      ...(options.faces === undefined ? {} : { faces: options.faces }),
    });
  return {
    engine,
    beginResponse,
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
      const responseContext = beginResponse(event.request);
      event.context.glyphscramble = responseContext;
      const response = await next();
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeadersForContext(responseContext, response.headers),
      });
    },
  } as const;
}
