import {
  createGlyphEngine,
  responseHeadersForContext,
  type GlyphConfig,
  type GlyphEngine,
  type GlyphResponseFace,
  type ResponseContext,
} from "@brip/glyphscramble";

export { GlyphScramble } from "@brip/glyphscramble-vue";

export interface GlyphNitroEvent {
  request: Request;
  context: { glyphscramble?: ResponseContext };
}

export interface NuxtGlyphOptions {
  cwd?: string;
  faces?: readonly GlyphResponseFace[];
  /** Stable identity shared by independently bundled Nitro runtime entries. */
  instanceKey?: string;
}

export interface NuxtGlyphs {
  readonly engine: GlyphEngine;
  beginResponse(request: Request): ResponseContext;
  middleware(
    event: GlyphNitroEvent,
    next: () => Promise<Response>,
  ): Promise<Response>;
  close(): Promise<void>;
}

const GLOBAL_ENGINE_REGISTRY = "__bripGlyphScrambleNuxtEngines";

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

function engineRegistry(): Map<string, Promise<NuxtGlyphs>> {
  const target = globalThis as typeof globalThis & {
    [GLOBAL_ENGINE_REGISTRY]?: Map<string, Promise<NuxtGlyphs>>;
  };
  return (target[GLOBAL_ENGINE_REGISTRY] ??= new Map());
}

function engineKey(config: GlyphConfig, options: NuxtGlyphOptions): string {
  return (
    options.instanceKey ??
    JSON.stringify([
      options.cwd ?? process.cwd(),
      stableValue(config),
      stableValue(options.faces ?? null),
    ])
  );
}

async function initializeNuxtGlyphs(
  config: GlyphConfig,
  options: NuxtGlyphOptions,
  onClose: () => void,
): Promise<NuxtGlyphs> {
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
    async close() {
      onClose();
      await engine.close();
    },
  };
}

/**
 * Reuses one process engine across Nitro's plugin and route-handler chunks.
 * Tokens coordinate with process-local one-use font variants, so separate
 * engine instances for one config would make valid payload URLs miss.
 */
export function createNuxtGlyphs(
  config: GlyphConfig,
  options: NuxtGlyphOptions = {},
): Promise<NuxtGlyphs> {
  const registry = engineRegistry();
  const key = engineKey(config, options);
  const existing = registry.get(key);
  if (existing) return existing;

  const created = initializeNuxtGlyphs(config, options, () => {
    if (registry.get(key) === created) registry.delete(key);
  }).catch((error: unknown) => {
    if (registry.get(key) === created) registry.delete(key);
    throw error;
  });
  registry.set(key, created);
  return created;
}
