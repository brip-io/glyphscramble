import type { Handle, RequestEvent, RequestHandler } from "@sveltejs/kit";
import {
  createGlyphEngine,
  protectedResponseHeaders,
  responseHeadersForContext,
  type GlyphConfig,
  type GlyphDrainOptions,
  type GlyphEngine,
  type GlyphResponseFace,
  type ResponseContext,
} from "@brip/glyphscramble";
import { matchesProtectedRoute, normalizeProtectedRoutes } from "./routes.js";

export interface GlyphSvelteKitLocals {
  glyphscramble?: ResponseContext;
}

export interface SvelteKitGlyphOptions {
  cwd?: string;
  /** Fixed prepared-face scope authorized for every response context. */
  faces?: readonly GlyphResponseFace[];
  streaming?: {
    /**
     * Routes that can emit a payload after SvelteKit finalizes response headers.
     * Each entry matches the exact path and its descendants.
     */
    protectedRoutes?: readonly `/${string}`[];
  };
}

export type GlyphHandle = Handle & {
  readonly engine: GlyphEngine;
  readonly fontEndpoint: RequestHandler;
  drain(options?: GlyphDrainOptions): Promise<void>;
  close(): Promise<void>;
};

function glyphLocals(event: RequestEvent): App.Locals & GlyphSvelteKitLocals {
  return event.locals;
}

/** Return the request-local context installed by the GlyphScramble handle. */
export function getGlyphResponseContext(event: RequestEvent): ResponseContext {
  const context = glyphLocals(event).glyphscramble;
  if (!context)
    throw new Error(
      "GlyphScramble has no request context. Ensure createGlyphHandle() participates in this request before accessing event.locals.glyphscramble.",
    );
  return context;
}

export async function createGlyphHandle(
  config: GlyphConfig,
  options: SvelteKitGlyphOptions = {},
): Promise<GlyphHandle> {
  const protectedRoutes = normalizeProtectedRoutes(
    options.streaming?.protectedRoutes,
  );
  const engine = await createGlyphEngine(config, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  const fontEndpoint: RequestHandler = ({ request }) =>
    engine.fontResponse(request);

  const handle: Handle = async ({ event, resolve }) => {
    if (event.url.pathname.startsWith(`${config.routePrefix}/font/`))
      return fontEndpoint(event);

    const responseContext = engine.beginResponse({
      signal: event.request.signal,
      ...(options.faces === undefined ? {} : { faces: options.faces }),
    });
    glyphLocals(event).glyphscramble = responseContext;
    const forceProtected = matchesProtectedRoute(
      event.url.pathname,
      protectedRoutes,
    );
    const response = await resolve(event);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: forceProtected
        ? protectedResponseHeaders(response.headers)
        : responseHeadersForContext(responseContext, response.headers),
    });
  };

  return Object.assign(handle, {
    engine,
    fontEndpoint,
    drain: (drainOptions?: GlyphDrainOptions) => engine.drain(drainOptions),
    close: () => engine.close(),
  });
}
