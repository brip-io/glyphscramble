import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import {
  createGlyphEngine,
  protectedResponseHeaders,
  responseHeadersForContext,
  type GlyphConfig,
  type GlyphPayload,
  type GlyphProtectionResult,
  type GlyphResponseFace,
  type OptionalScrambleOptions,
  type ResponseContext,
  type ScrambleOptions,
} from "@brip/glyphscramble";

export interface NextGlyphs {
  readonly engine: Awaited<ReturnType<typeof createGlyphEngine>>;
  /** Request-local context for Server Components in the current RSC render. */
  getResponseContext(): Promise<ResponseContext>;
  /** Convert plaintext at the Server Component boundary. */
  scramble(text: string, options: ScrambleOptions): Promise<GlyphPayload>;
  /** Explicit optional-block boundary; omitted results never contain plaintext. */
  protect(
    text: string,
    options: OptionalScrambleOptions,
  ): Promise<GlyphProtectionResult>;
  /** Independent context for Route Handlers, which are outside React cache. */
  beginRouteResponse(): ResponseContext;
  /** Export as GET and HEAD from the generated Node.js font Route Handler. */
  fontRoute(request: Request): Promise<Response>;
  /** Apply only after a Route Handler context actually emitted a payload. */
  responseHeadersFor(context: ResponseContext, headers?: HeadersInit): Headers;
  /** Explicit response-rotated headers for custom response boundaries. */
  protectedResponseHeaders(headers?: HeadersInit): Headers;
  close(): Promise<void>;
}

export interface NextGlyphOptions {
  cwd?: string;
  /** Fixed prepared-face scope shared by this helper's response contexts. */
  faces?: readonly GlyphResponseFace[];
  /**
   * Stable identity for one engine in this process. Set this only when two
   * intentionally separate GlyphScramble configurations are otherwise equal.
   */
  instanceKey?: string;
}

const GLOBAL_ENGINE_REGISTRY = "__bripGlyphScrambleNextEngines";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  return value;
}

function engineRegistry(): Map<string, Promise<NextGlyphs>> {
  const target = globalThis as typeof globalThis & {
    [GLOBAL_ENGINE_REGISTRY]?: Map<string, Promise<NextGlyphs>>;
  };
  return (target[GLOBAL_ENGINE_REGISTRY] ??= new Map());
}

function engineKey(config: GlyphConfig, options: NextGlyphOptions): string {
  return (
    options.instanceKey ??
    JSON.stringify([
      options.cwd ?? process.cwd(),
      stableValue(config),
      stableValue(options.faces ?? null),
    ])
  );
}

async function initializeNextGlyphs(
  config: GlyphConfig,
  options: NextGlyphOptions,
  onClose: () => void,
): Promise<NextGlyphs> {
  const engine = await createGlyphEngine(config, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  const getResponseContext = cache(async (): Promise<ResponseContext> => {
    // Next 16 excludes work below connection() from prerendering and emits its
    // private no-store policy for the resulting dynamic HTML/RSC response.
    await connection();
    return engine.beginResponse({
      ...(options.faces === undefined ? {} : { faces: options.faces }),
    });
  });

  return {
    engine,
    getResponseContext,
    async scramble(text, scrambleOptions) {
      return (await getResponseContext()).scrambleAsync(text, scrambleOptions);
    },
    async protect(text, scrambleOptions) {
      return (await getResponseContext()).protectAsync(text, scrambleOptions);
    },
    beginRouteResponse: () =>
      engine.beginResponse({
        ...(options.faces === undefined ? {} : { faces: options.faces }),
      }),
    fontRoute: (request) => engine.fontResponse(request),
    responseHeadersFor: (context, headers) =>
      responseHeadersForContext(context, headers),
    protectedResponseHeaders: (headers) => protectedResponseHeaders(headers),
    async close() {
      onClose();
      await engine.close();
    },
  };
}

/**
 * Reuses one engine across Next's independently bundled page and Route Handler
 * modules. The process-global registry is required because a response token is
 * coordinated with process-local, one-use font bytes.
 */
export function createNextGlyphs(
  config: GlyphConfig,
  options: NextGlyphOptions = {},
): Promise<NextGlyphs> {
  const registry = engineRegistry();
  const key = engineKey(config, options);
  const existing = registry.get(key);
  if (existing) return existing;

  const created = initializeNextGlyphs(config, options, () => {
    if (registry.get(key) === created) registry.delete(key);
  }).catch((error: unknown) => {
    if (registry.get(key) === created) registry.delete(key);
    throw error;
  });
  registry.set(key, created);
  return created;
}
