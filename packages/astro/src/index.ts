import {
  createGlyphEngine,
  responseHeadersForContext,
  type GlyphConfig,
  type ResponseContext,
} from "@brip/glyphscramble";

export interface GlyphAstroContext {
  request: Request;
  url: URL;
  locals: { glyphscramble?: ResponseContext };
}

export async function createAstroGlyphMiddleware(
  config: GlyphConfig,
  options: { cwd?: string } = {},
) {
  const engine = await createGlyphEngine(config, options);
  return async (
    context: GlyphAstroContext,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    if (context.url.pathname.startsWith(`${config.routePrefix}/font/`))
      return engine.fontResponse(context.request);
    const responseContext = engine.beginResponse();
    context.locals.glyphscramble = responseContext;
    const response = await next();
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeadersForContext(responseContext, response.headers),
    });
  };
}
