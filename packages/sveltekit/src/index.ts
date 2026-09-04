import {
  createGlyphEngine,
  responseHeadersForContext,
  type GlyphConfig,
  type GlyphResponseFace,
  type ResponseContext,
} from "@brip/glyphscramble";

export interface GlyphSvelteKitEvent {
  request: Request;
  url: URL;
  locals: { glyphscramble?: ResponseContext };
}

export type GlyphHandle = (input: {
  event: GlyphSvelteKitEvent;
  resolve: (event: GlyphSvelteKitEvent) => Promise<Response>;
}) => Promise<Response>;

export async function createGlyphHandle(
  config: GlyphConfig,
  options: { cwd?: string; faces?: readonly GlyphResponseFace[] } = {},
): Promise<GlyphHandle> {
  const engine = await createGlyphEngine(config, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  return async ({ event, resolve }) => {
    if (event.url.pathname.startsWith(`${config.routePrefix}/font/`))
      return engine.fontResponse(event.request);
    const responseContext = engine.beginResponse({
      signal: event.request.signal,
      ...(options.faces === undefined ? {} : { faces: options.faces }),
    });
    event.locals.glyphscramble = responseContext;
    const response = await resolve(event);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeadersForContext(responseContext, response.headers),
    });
  };
}
