import type { APIContext, MiddlewareHandler } from "astro";
import {
  createGlyphEngine,
  protectedResponseHeaders,
  responseHeadersForContext,
  type GlyphConfig,
  type GlyphEngine,
  type GlyphResponseFace,
  type ResponseContext,
} from "@brip/glyphscramble";

const DEFAULT_MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const MAX_BUFFERED_BYTES = 16 * 1024 * 1024;

export interface GlyphAstroLocals {
  glyphscramble?: ResponseContext;
}

export type AstroStreamingPolicy =
  | {
      /** Discover lazy component use before response headers commit. */
      strategy?: "buffer";
      maxBytes?: number;
    }
  | {
      /** Preserve streaming only for routes explicitly declared protected. */
      strategy: "route";
      protectedRoute(context: APIContext): boolean;
    };

export interface AstroGlyphOptions {
  cwd?: string;
  /** Fixed prepared-face scope for protected routes handled here. */
  faces?: readonly GlyphResponseFace[];
  streaming?: AstroStreamingPolicy;
}

export interface AstroGlyphMiddleware extends MiddlewareHandler {
  readonly engine: GlyphEngine;
  close(): Promise<void>;
}

function boundedBytes(value: number | undefined): number {
  const limit = value ?? DEFAULT_MAX_BUFFERED_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BUFFERED_BYTES)
    throw new TypeError(
      `Astro buffered responses must be between 1 and ${MAX_BUFFERED_BYTES} bytes.`,
    );
  return limit;
}

async function readResponseBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel(
          `GlyphScramble Astro response exceeded ${maxBytes} buffered bytes.`,
        );
        throw new Error(
          `GlyphScramble Astro response exceeded the ${maxBytes} byte buffer ceiling. Use route-scoped streaming for a known protected route or raise streaming.maxBytes explicitly.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function responseWithHeaders(
  response: Response,
  body: Uint8Array | null,
  headers: Headers,
): Response {
  if (body !== null) headers.set("content-length", String(body.byteLength));
  return new Response(body === null ? null : (body.buffer as ArrayBuffer), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Creates one process-level Astro middleware. The default bounded-buffer policy
 * exhausts Astro's lazy response stream before deciding selective cache
 * headers. Route-scoped mode keeps streaming, but exposes a response context
 * only on routes declared protected and commits no-store before rendering.
 */
export async function createAstroGlyphMiddleware(
  config: GlyphConfig,
  options: AstroGlyphOptions = {},
): Promise<AstroGlyphMiddleware> {
  const engine = await createGlyphEngine(config, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  const streaming = options.streaming ?? { strategy: "buffer" };
  const maxBytes =
    streaming.strategy === "route"
      ? undefined
      : boundedBytes(streaming.maxBytes);

  const middleware: MiddlewareHandler = async (context, next) => {
    if (context.url.pathname.startsWith(`${config.routePrefix}/font/`))
      return engine.fontResponse(context.request);

    if (streaming.strategy === "route") {
      if (!streaming.protectedRoute(context)) return next();
      const responseContext = engine.beginResponse({
        signal: context.request.signal,
        ...(options.faces === undefined ? {} : { faces: options.faces }),
      });
      (context.locals as GlyphAstroLocals).glyphscramble = responseContext;
      const response = await next();
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: protectedResponseHeaders(response.headers),
      });
    }

    const responseContext = engine.beginResponse({
      signal: context.request.signal,
      ...(options.faces === undefined ? {} : { faces: options.faces }),
    });
    (context.locals as GlyphAstroLocals).glyphscramble = responseContext;
    const response = await next();
    const body = await readResponseBody(response, maxBytes!);
    return responseWithHeaders(
      response,
      body,
      responseHeadersForContext(responseContext, response.headers),
    );
  };

  return Object.assign(middleware, {
    engine,
    close: () => engine.close(),
  });
}
