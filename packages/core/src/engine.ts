import { createHash } from "node:crypto";
import { parseSfnt, remapCmap } from "./sfnt.js";
import {
  loadPreparedFont,
  toWoff2,
  type PreparedFont,
} from "./font-pipeline.js";
import { issueToken, readToken } from "./token.js";
import { createPermutation, encodeText, type Permutation } from "./unicode.js";
import { validateGlyphConfig } from "./config.js";
import type {
  GlyphConfig,
  GlyphEngine,
  GlyphPayload,
  ResponseContext,
  ScrambleOptions,
} from "./types.js";

interface RuntimeFont extends PreparedFont {
  codepoints: readonly number[];
  coverage: readonly string[];
}

function secretFor(config: GlyphConfig): string {
  const secret = process.env[config.rotation.secretEnv];
  if (!secret)
    throw new Error(
      `Missing ${config.rotation.secretEnv}. GlyphScramble cannot rotate safely without a server secret.`,
    );
  return secret;
}

function escapeCss(value: string): string {
  return value.replace(
    /["'\\\n\r]/g,
    (character) => `\\${character.codePointAt(0)!.toString(16)} `,
  );
}

function payload(
  text: string,
  font: RuntimeFont,
  token: string,
  permutation: Permutation,
  config: GlyphConfig,
  options: ScrambleOptions,
): GlyphPayload {
  const short = createHash("sha256")
    .update(token)
    .update(font.id)
    .digest("hex")
    .slice(0, 16);
  const family = `GlyphScramble-${font.id}-${short}`;
  const fontUrl = `${config.routePrefix}/font/${encodeURIComponent(token)}/${encodeURIComponent(font.id)}.woff2`;
  const css = `@font-face{font-family:"${escapeCss(family)}";src:url("${escapeCss(fontUrl)}") format("woff2");font-display:block}`;
  return {
    version: 1,
    encodedText: encodeText(text, permutation),
    font: font.id,
    fontToken: token,
    family,
    fontUrl,
    coverage: font.coverage,
    css,
    ...(options.cspNonce ? { cspNonce: options.cspNonce } : {}),
  } as GlyphPayload;
}

class MemoryFontCache {
  readonly #items = new Map<string, Uint8Array>();
  constructor(private readonly max = 128) {}
  get(key: string): Uint8Array | undefined {
    const value = this.#items.get(key);
    if (value) {
      this.#items.delete(key);
      this.#items.set(key, value);
    }
    return value;
  }
  set(key: string, value: Uint8Array): void {
    this.#items.delete(key);
    this.#items.set(key, value);
    if (this.#items.size > this.max)
      this.#items.delete(this.#items.keys().next().value!);
  }
  clear(): void {
    this.#items.clear();
  }
}

export async function createGlyphEngine(
  config: GlyphConfig,
  options: { cwd?: string; cacheEntries?: number } = {},
): Promise<GlyphEngine> {
  validateGlyphConfig(config);
  const secret = secretFor(config);
  const fonts = new Map<string, RuntimeFont>();
  for (const id of Object.keys(config.fonts)) {
    const prepared = await loadPreparedFont(id, options.cwd);
    const locked = prepared.metadata as typeof prepared.metadata & {
      coverage?: readonly string[];
    };
    fonts.set(id, {
      ...prepared,
      codepoints: prepared.metadata.codepoints,
      coverage: locked.coverage ?? [],
    });
  }
  const cache = new MemoryFontCache(options.cacheEntries);

  return {
    beginResponse(): ResponseContext {
      const issued = issueToken(secret, config.rotation.tokenTtlSeconds);
      const permutations = new Map<string, Permutation>();
      return {
        token: issued.token,
        scramble(text: string, scrambleOptions: ScrambleOptions): GlyphPayload {
          const font = fonts.get(scrambleOptions.font);
          if (!font)
            throw new Error(
              `Unknown GlyphScramble font: ${scrambleOptions.font}`,
            );
          let permutation = permutations.get(font.id);
          if (!permutation) {
            permutation = createPermutation(
              font.codepoints,
              issued.seed,
              font.id,
            );
            permutations.set(font.id, permutation);
          }
          return payload(
            text,
            font,
            issued.token,
            permutation,
            config,
            scrambleOptions,
          );
        },
      };
    },

    async fontResponse(request: Request): Promise<Response> {
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { allow: "GET, HEAD" },
        });
      const parts = new URL(request.url).pathname.split("/").filter(Boolean);
      const prefix = config.routePrefix.split("/").filter(Boolean);
      if (
        parts.length !== prefix.length + 3 ||
        !prefix.every((part, index) => parts[index] === part) ||
        parts[prefix.length] !== "font"
      ) {
        return new Response("Not Found", { status: 404 });
      }
      const token = decodeURIComponent(parts[prefix.length + 1]!);
      const file = decodeURIComponent(parts[prefix.length + 2]!);
      if (!file.endsWith(".woff2"))
        return new Response("Not Found", { status: 404 });
      const id = file.slice(0, -6);
      const font = fonts.get(id);
      if (!font) return new Response("Not Found", { status: 404 });
      let claims;
      try {
        claims = readToken(token, secret);
      } catch {
        return new Response("Invalid or expired font token", {
          status: 401,
          headers: { "cache-control": "private, no-store" },
        });
      }
      const cacheKey = `${token}:${id}`;
      let output = cache.get(cacheKey);
      if (!output) {
        const permutation = createPermutation(font.codepoints, claims.seed, id);
        output = await toWoff2(
          remapCmap(parseSfnt(font.sfnt), permutation.decode),
        );
        cache.set(cacheKey, output);
      }
      return new Response(
        request.method === "HEAD" ? null : new Uint8Array(output).buffer,
        {
          headers: {
            "content-type": "font/woff2",
            "content-length": String(output.length),
            "cache-control": `private, max-age=${config.rotation.tokenTtlSeconds}, immutable`,
            "x-content-type-options": "nosniff",
            "cross-origin-resource-policy": "same-origin",
          },
        },
      );
    },

    async close(): Promise<void> {
      cache.clear();
    },
  };
}

/** Headers for any HTML, RSC, or JSON response containing a GlyphPayload. */
export function protectedResponseHeaders(headers: HeadersInit = {}): Headers {
  const result = new Headers(headers);
  result.set("cache-control", "private, no-store");
  result.set("x-glyphscramble", "response-rotated");
  return result;
}
