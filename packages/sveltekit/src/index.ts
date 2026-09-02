import {
  createGlyphEngine,
  protectedResponseHeaders,
  type GlyphConfig,
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
  options: { cwd?: string } = {},
): Promise<GlyphHandle> {
  const engine = await createGlyphEngine(config, options);
  return async ({ event, resolve }) => {
    if (event.url.pathname.startsWith(`${config.routePrefix}/font/`))
      return engine.fontResponse(event.request);
    event.locals.glyphscramble = engine.beginResponse();
    const response = await resolve(event);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: protectedResponseHeaders(response.headers),
    });
  };
}
