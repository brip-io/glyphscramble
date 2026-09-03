import { createHash } from "node:crypto";
import { loadPreparedFonts, type PreparedFont } from "./font-pipeline.js";
import {
  issueToken,
  readToken,
  type TokenKey,
  type TokenKeyRing,
} from "./token.js";
import {
  createPermutationFromPlan,
  createPermutationPlan,
  encodeText,
  type Permutation,
  type PermutationPlan,
} from "./unicode.js";
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
  permutationPlan: PermutationPlan;
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

function keyFromEnvironment(id: string, secretEnv: string): TokenKey {
  const secret = process.env[secretEnv];
  if (!secret)
    throw new Error(
      `Missing ${secretEnv}. GlyphScramble cannot rotate safely without every configured server secret.`,
    );
  if (secret.length < 32)
    throw new Error(`${secretEnv} must contain at least 32 characters.`);
  return { id, secret };
}

function tokenKeyRing(config: GlyphConfig): TokenKeyRing {
  return {
    current: keyFromEnvironment(
      config.rotation.keyId ?? "current",
      config.rotation.secretEnv,
    ),
    previous: (config.rotation.previousKeys ?? []).map((key) =>
      keyFromEnvironment(key.id, key.secretEnv),
    ),
  };
}

function payload(
  encodedText: string,
  font: RuntimeFont,
  token: string,
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
  return {
    version: 2,
    encodedText,
    font: font.id,
    face: {
      id: font.faceId,
      family,
      weight: descriptors.weight,
      style: descriptors.style,
      stretch: descriptors.stretch,
      unicodeRange: descriptors.unicodeRange,
    },
    fontToken: token,
    fontUrl,
    coverage: {
      identity: font.metadata.identity,
      ranges: font.coverage,
    },
    rotation: {
      scope: "response",
      variantMode: "response-pool",
      reusableAcrossResponses: false,
    },
    ...(options.lang ? { lang: options.lang } : {}),
    ...(options.cspNonce ? { cspNonce: options.cspNonce } : {}),
  } as GlyphPayload;
}

export async function createGlyphEngine(
  config: GlyphConfig,
  options: {
    cwd?: string;
    variantProvider?: FontVariantProvider;
    now?: () => number;
  } = {},
): Promise<GlyphEngine> {
  validateGlyphConfig(config);
  const keys = tokenKeyRing(config);
  const now = options.now ?? Date.now;
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
        permutationPlan: createPermutationPlan(prepared.metadata.codepoints),
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
      undefined,
      now,
    );
  try {
    await variantProvider.start();
  } catch (error) {
    await variantProvider.close();
    throw error;
  }

  return {
    beginResponse(): ResponseContext {
      let lease: ReturnType<FontVariantProvider["acquire"]> | undefined;
      let leaseIssuedAt: number | undefined;
      let issued: ReturnType<typeof issueToken> | undefined;
      let issuedFaces = "";
      const authorizedFaces = new Set<string>();
      const ensureLease = () => {
        if (lease) return lease;
        const issuedAt = now();
        const expiresAt =
          (Math.floor(issuedAt / 1000) + config.rotation.tokenTtlSeconds) *
          1000;
        lease = variantProvider.acquire(expiresAt);
        leaseIssuedAt = issuedAt;
        return lease;
      };
      const ensureIssued = (): ReturnType<typeof issueToken> => {
        const responseLease = ensureLease();
        const faces = [...authorizedFaces].sort();
        const faceKey = faces.join("\0");
        if (issued && issuedFaces === faceKey) return issued;
        issued = issueToken(
          keys.current,
          config.rotation.tokenTtlSeconds,
          {
            seed: responseLease.seed,
            variant: responseLease.id,
            variantMode: "response-pool",
            faces,
          },
          leaseIssuedAt,
        );
        issuedFaces = faceKey;
        return issued;
      };
      const permutations = new Map<string, Permutation>();
      return {
        get token() {
          return ensureIssued().token;
        },
        get used() {
          return authorizedFaces.size > 0;
        },
        usage() {
          return Object.freeze({
            used: authorizedFaces.size > 0,
            authorizedFaces: Object.freeze([...authorizedFaces].sort()),
            ...(lease ? { variantId: lease.id } : {}),
          });
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
          const responseLease = ensureLease();
          const namespace = runtimeNamespace(font);
          let permutation = permutations.get(namespace);
          if (!permutation) {
            permutation = createPermutationFromPlan(
              font.permutationPlan,
              responseLease.seed,
              namespace,
            );
            permutations.set(namespace, permutation);
          }
          const encodedText = encodeText(text, permutation);
          authorizedFaces.add(runtimeId(font));
          const responseToken = ensureIssued();
          return payload(
            encodedText,
            font,
            responseToken.token,
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
      let token: string;
      let file: string;
      try {
        token = decodeURIComponent(parts[prefix.length + 1]!);
        file = decodeURIComponent(parts[prefix.length + 2]!);
      } catch {
        return new Response("Malformed font path", {
          status: 400,
          headers: { "cache-control": "private, no-store" },
        });
      }
      if (!file.endsWith(".woff2"))
        return new Response("Not Found", { status: 404 });
      const id = file.slice(0, -6);
      let claims;
      try {
        claims = readToken(token, keys, {
          maxLifetimeSeconds: config.rotation.tokenTtlSeconds,
          maxFaces: fonts.size,
          now: now(),
        });
      } catch {
        return new Response("Invalid or expired font token", {
          status: 401,
          headers: { "cache-control": "private, no-store" },
        });
      }
      if (claims.variantMode !== "response-pool" || !claims.faces?.includes(id))
        return new Response("Font is not authorized by this token", {
          status: 403,
          headers: { "cache-control": "private, no-store" },
        });
      const font = fonts.get(id);
      if (!font) return new Response("Not Found", { status: 404 });
      const output = variantProvider.font(claims.variant, id, claims.seed);
      if (!output)
        return new Response("Font variant is no longer available", {
          status: 410,
          headers: { "cache-control": "private, no-store" },
        });
      const remainingSeconds = Math.max(
        0,
        claims.exp - Math.floor(now() / 1000),
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

/** Preserve the original cache policy unless this context emitted a payload. */
export function responseHeadersForContext(
  context: ResponseContext,
  headers: HeadersInit = {},
): Headers {
  return context.used
    ? protectedResponseHeaders(headers)
    : new Headers(headers);
}
