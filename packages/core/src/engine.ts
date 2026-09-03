import { createHash } from "node:crypto";
import { loadPreparedFonts, type PreparedFont } from "./font-pipeline.js";
import { issueToken, readToken } from "./token.js";
import { createPermutation, encodeText, type Permutation } from "./unicode.js";
import { validateGlyphConfig } from "./config.js";
import {
  ResponsePoolVariantProvider,
  variantRuntimeOptions,
  type FontVariantProvider,
  type VariantFace,
} from "./variant-provider.js";
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

interface RuntimeFamily {
  defaultFace: string;
  faces: Map<string, RuntimeFont>;
}

function runtimeId(font: Pick<PreparedFont, "id" | "faceId">): string {
  return `${font.id}@${font.faceId}`;
}

function runtimeNamespace(font: RuntimeFont): string {
  return `${runtimeId(font)}:${font.metadata.identity}`;
}

function secretFor(config: GlyphConfig): string {
  const secret = process.env[config.rotation.secretEnv];
  if (!secret)
    throw new Error(
      `Missing ${config.rotation.secretEnv}. GlyphScramble cannot rotate safely without a server secret.`,
    );
  if (secret.length < 32)
    throw new Error(
      `${config.rotation.secretEnv} must contain at least 32 characters.`,
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
    .update(runtimeNamespace(font))
    .digest("hex")
    .slice(0, 16);
  const family = `GlyphScramble-${font.id}-${font.faceId}-${short}`;
  const fileId = runtimeId(font);
  const fontUrl = `${config.routePrefix}/font/${encodeURIComponent(token)}/${encodeURIComponent(fileId)}.woff2`;
  const descriptors = font.metadata.descriptors;
  const css = `@font-face{font-family:"${escapeCss(family)}";src:url("${escapeCss(fontUrl)}") format("woff2");font-weight:${escapeCss(descriptors.weight)};font-style:${escapeCss(descriptors.style)};font-stretch:${escapeCss(descriptors.stretch)};unicode-range:${descriptors.unicodeRange.join(",")};font-display:block}`;
  return {
    version: 1,
    encodedText: encodeText(text, permutation),
    font: font.id,
    face: font.faceId,
    fontToken: token,
    family,
    fontUrl,
    coverage: font.coverage,
    css,
    rotation: {
      scope: "response",
      variantMode: "response-pool",
      reusableAcrossResponses: false,
    },
    ...(options.cspNonce ? { cspNonce: options.cspNonce } : {}),
  } as GlyphPayload;
}

export async function createGlyphEngine(
  config: GlyphConfig,
  options: { cwd?: string; variantProvider?: FontVariantProvider } = {},
): Promise<GlyphEngine> {
  validateGlyphConfig(config);
  const secret = secretFor(config);
  const fonts = new Map<string, RuntimeFont>();
  const families = new Map<string, RuntimeFamily>();
  for (const id of Object.keys(config.fonts)) {
    const preparedFaces = await loadPreparedFonts(id, options.cwd);
    const runtimeFaces = new Map<string, RuntimeFont>();
    for (const prepared of preparedFaces) {
      const runtimeFont = {
        ...prepared,
        codepoints: prepared.metadata.codepoints,
        coverage: prepared.metadata.coverage,
      };
      runtimeFaces.set(prepared.faceId, runtimeFont);
      fonts.set(runtimeId(prepared), runtimeFont);
    }
    const configuredDefault = config.fonts[id]!.defaultFace;
    const defaultFace =
      configuredDefault ??
      preparedFaces.find((item) => item.faceId === "default")?.faceId ??
      preparedFaces[0]?.faceId;
    if (!defaultFace) throw new Error(`Font ${id} has no prepared faces.`);
    families.set(id, { defaultFace, faces: runtimeFaces });
  }
  const variantFaces: VariantFace[] = [...fonts.values()].map((font) => ({
    id: runtimeId(font),
    namespace: runtimeNamespace(font),
    sfnt: font.sfnt,
    codepoints: font.codepoints,
  }));
  const variantProvider =
    options.variantProvider ??
    new ResponsePoolVariantProvider(
      variantFaces,
      variantRuntimeOptions(config.runtime),
    );
  try {
    await variantProvider.start();
  } catch (error) {
    await variantProvider.close();
    throw error;
  }

  return {
    beginResponse(): ResponseContext {
      let issued: ReturnType<typeof issueToken> | undefined;
      const ensureIssued = (): ReturnType<typeof issueToken> => {
        if (issued) return issued;
        const now = Date.now();
        const expiresAt =
          (Math.floor(now / 1000) + config.rotation.tokenTtlSeconds) * 1000;
        const lease = variantProvider.acquire(expiresAt);
        issued = issueToken(secret, config.rotation.tokenTtlSeconds, now, {
          seed: lease.seed,
          variant: lease.id,
          variantMode: "response-pool",
          faces: variantFaces.map((face) => face.id),
        });
        return issued;
      };
      const permutations = new Map<string, Permutation>();
      return {
        get token() {
          return ensureIssued().token;
        },
        scramble(text: string, scrambleOptions: ScrambleOptions): GlyphPayload {
          const family = families.get(scrambleOptions.font);
          if (!family)
            throw new Error(
              `Unknown GlyphScramble font: ${scrambleOptions.font}`,
            );
          const faceId = scrambleOptions.face ?? family.defaultFace;
          const font = family.faces.get(faceId);
          if (!font)
            throw new Error(
              `Unknown GlyphScramble face: ${scrambleOptions.font}.${faceId}`,
            );
          const responseToken = ensureIssued();
          const namespace = runtimeNamespace(font);
          let permutation = permutations.get(namespace);
          if (!permutation) {
            permutation = createPermutation(
              font.codepoints,
              responseToken.seed,
              namespace,
            );
            permutations.set(namespace, permutation);
          }
          return payload(
            text,
            font,
            responseToken.token,
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
      if (
        !claims.variant ||
        claims.variantMode !== "response-pool" ||
        !claims.faces?.includes(id)
      )
        return new Response("Unsupported font token mode", {
          status: 401,
          headers: { "cache-control": "private, no-store" },
        });
      const output = variantProvider.font(claims.variant, id, claims.seed);
      if (!output)
        return new Response("Font variant is no longer available", {
          status: 410,
          headers: { "cache-control": "private, no-store" },
        });
      const remainingSeconds = Math.max(
        0,
        claims.exp - Math.floor(Date.now() / 1000),
      );
      return new Response(
        request.method === "HEAD" ? null : new Uint8Array(output).buffer,
        {
          headers: {
            "content-type": "font/woff2",
            "content-length": String(output.length),
            "cache-control": `private, max-age=${remainingSeconds}, immutable`,
            "x-content-type-options": "nosniff",
            "cross-origin-resource-policy": "same-origin",
            "x-glyphscramble-variant-mode": "response-pool",
          },
        },
      );
    },

    metrics() {
      return variantProvider.metrics();
    },

    async close(): Promise<void> {
      await variantProvider.close();
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
