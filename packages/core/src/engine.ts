import { createHash } from "node:crypto";
import {
  loadPreparedFontFamilies,
  type PreparedFont,
} from "./font-pipeline.js";
import {
  issueToken,
  readToken,
  type TokenKey,
  type TokenKeyRing,
} from "./token.js";
import {
  assertTextSupported,
  createPermutationPlan,
  encodeText,
  UnsupportedTextError,
} from "./unicode.js";
import { assertPayloadWireSize, assertTimerDelay } from "./limits.js";
import { assertGlyphPayload, assertGlyphPayloadOptions } from "./browser.js";
import { GlyphContentError } from "./content-error.js";
import { validateGlyphConfig } from "./config.js";
import {
  ResponsePoolVariantProvider,
  variantRuntimeOptions,
  type FontVariantProvider,
  type VariantFace,
} from "./variant-provider.js";
import type {
  GlyphConfig,
  GlyphAcquisitionOptions,
  GlyphDrainOptions,
  GlyphEngine,
  GlyphPayload,
  GlyphProtectionResult,
  GlyphRuntimeEventHandler,
  ResponseContext,
  OptionalScrambleOptions,
  ScrambleOptions,
} from "./types.js";

interface RuntimeFont extends PreparedFont {
  coverage: readonly string[];
  mappableCodepoints: ReadonlySet<number>;
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
  const result = {
    current: keyFromEnvironment(
      config.rotation.keyId ?? "current",
      config.rotation.secretEnv,
    ),
    previous: (config.rotation.previousKeys ?? []).map((key) =>
      keyFromEnvironment(key.id, key.secretEnv),
    ),
  };
  return result;
}

function payload(
  encodedText: string,
  font: RuntimeFont,
  issued: ReturnType<typeof issueToken>,
  config: GlyphConfig,
  options: ScrambleOptions,
): GlyphPayload {
  const token = issued.token;
  const short = createHash("sha256")
    .update(token)
    .update(runtimeNamespace(font))
    .digest("hex")
    .slice(0, 16);
  const family = `GlyphScramble-${font.id}-${font.faceId}-${short}`;
  const fileId = runtimeId(font);
  const fontUrl = `${config.routePrefix}/font/${encodeURIComponent(token)}/${encodeURIComponent(fileId)}.woff2`;
  const descriptors = font.metadata.descriptors;
  const result = {
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
    expiresAt: issued.exp,
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
  assertGlyphPayload(result);
  return result;
}

export async function createGlyphEngine(
  config: GlyphConfig,
  options: {
    cwd?: string;
    variantProvider?: FontVariantProvider;
    now?: () => number;
    onEvent?: GlyphRuntimeEventHandler;
  } = {},
): Promise<GlyphEngine> {
  validateGlyphConfig(config);
  const keys = tokenKeyRing(config);
  const now = options.now ?? Date.now;
  const fonts = new Map<string, RuntimeFont>();
  const families = new Map<string, RuntimeFamily>();
  const variantFaces: VariantFace[] = [];
  const configuredFamilies = Object.keys(config.fonts);
  const preparedFamilies = await loadPreparedFontFamilies(
    configuredFamilies,
    options.cwd,
  );
  for (const id of configuredFamilies) {
    const preparedFaces = preparedFamilies.get(id)!;
    const runtimeFaces = new Map<string, RuntimeFont>();
    for (const prepared of preparedFaces) {
      const permutationPlan = createPermutationPlan(
        prepared.metadata.codepoints,
      );
      const mappableCodepoints = new Set(
        permutationPlan.groups
          .filter((group) => group.values.length >= 2)
          .flatMap((group) => group.values),
      );
      const runtimeFont = {
        ...prepared,
        coverage: prepared.metadata.coverage,
        mappableCodepoints,
      };
      runtimeFaces.set(prepared.faceId, runtimeFont);
      fonts.set(runtimeId(prepared), runtimeFont);
      variantFaces.push({
        id: runtimeId(prepared),
        namespace: runtimeNamespace(runtimeFont),
        sfnt: prepared.sfnt,
        permutationPlan,
      });
    }
    const configuredDefault = config.fonts[id]!.defaultFace;
    const defaultFace =
      configuredDefault ??
      preparedFaces.find((item) => item.faceId === "default")?.faceId ??
      preparedFaces[0]?.faceId;
    if (!defaultFace) throw new Error(`Font ${id} has no prepared faces.`);
    families.set(id, { defaultFace, faces: runtimeFaces });
  }
  const variantProvider =
    options.variantProvider ??
    new ResponsePoolVariantProvider(
      variantFaces,
      variantRuntimeOptions(config.runtime),
      undefined,
      now,
      options.onEvent,
    );
  try {
    await variantProvider.start();
  } catch (error) {
    await variantProvider.close();
    throw error;
  }

  return {
    beginResponse(
      responseAcquisition: GlyphAcquisitionOptions = {},
    ): ResponseContext {
      if (responseAcquisition.timeoutMs !== undefined)
        assertTimerDelay(
          responseAcquisition.timeoutMs,
          "Response acquisition timeout",
        );
      let lease: ReturnType<FontVariantProvider["acquire"]> | undefined;
      let leasePromise:
        Promise<ReturnType<FontVariantProvider["acquire"]>> | undefined;
      let leaseIssuedAt: number | undefined;
      let issued: ReturnType<typeof issueToken> | undefined;
      let issuedFaces = "";
      const authorizedFaces = new Set<string>();
      const expiryAt = (additionalMs = 0) =>
        (Math.floor((now() + additionalMs) / 1000) +
          config.rotation.tokenTtlSeconds) *
        1000;
      const ensureLease = () => {
        if (lease) return lease;
        if (leasePromise)
          throw new Error(
            "A response font variant is being acquired; await scrambleAsync() before using the synchronous path.",
          );
        const issuedAt = now();
        lease = variantProvider.acquire(expiryAt());
        leaseIssuedAt = issuedAt;
        return lease;
      };
      const ensureLeaseAsync = async (
        acquisition: GlyphAcquisitionOptions = {},
      ) => {
        if (lease) return lease;
        if (!leasePromise) {
          const timeoutMs =
            acquisition.timeoutMs ??
            responseAcquisition.timeoutMs ??
            config.runtime?.acquisitionTimeoutMs ??
            50;
          assertTimerDelay(timeoutMs, "Response acquisition timeout");
          const signal = acquisition.signal ?? responseAcquisition.signal;
          leasePromise = variantProvider
            .acquireAsync(expiryAt(timeoutMs), {
              timeoutMs,
              ...(signal === undefined ? {} : { signal }),
            })
            .then((acquired) => {
              lease = acquired;
              leaseIssuedAt = now();
              return acquired;
            })
            .catch((error: unknown) => {
              leasePromise = undefined;
              throw error;
            });
        }
        return leasePromise;
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
      const resolveFont = (scrambleOptions: ScrambleOptions) => {
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
        return font;
      };
      const contentError = (error: UnsupportedTextError, font: RuntimeFont) =>
        new GlyphContentError({
          codepoint: error.codepoint,
          normalization: error.normalization,
          font: font.id,
          face: font.faceId,
        });
      const validateText = (text: string, font: RuntimeFont) => {
        assertPayloadWireSize(text);
        try {
          assertTextSupported(text, (codepoint) =>
            font.mappableCodepoints.has(codepoint),
          );
        } catch (error) {
          if (!(error instanceof UnsupportedTextError)) throw error;
          throw contentError(error, font);
        }
      };
      const scrambleWithLease = (
        text: string,
        scrambleOptions: ScrambleOptions,
        responseLease: ReturnType<FontVariantProvider["acquire"]>,
      ): GlyphPayload => {
        const font = resolveFont(scrambleOptions);
        const mapping = variantProvider.mapping(responseLease, runtimeId(font));
        if (!mapping)
          throw new Error(
            "The response font variant expired before text could be scrambled.",
          );
        let encodedText: string;
        try {
          encodedText = encodeText(text, mapping);
        } catch (error) {
          if (!(error instanceof UnsupportedTextError)) throw error;
          throw contentError(error, font);
        }
        const faceId = runtimeId(font);
        const alreadyAuthorized = authorizedFaces.has(faceId);
        authorizedFaces.add(faceId);
        try {
          const responseToken = ensureIssued();
          return payload(
            encodedText,
            font,
            responseToken,
            config,
            scrambleOptions,
          );
        } catch (error) {
          if (!alreadyAuthorized) authorizedFaces.delete(faceId);
          issued = undefined;
          issuedFaces = "";
          throw error;
        }
      };
      const scramble = (
        text: string,
        scrambleOptions: ScrambleOptions,
      ): GlyphPayload => {
        assertGlyphPayloadOptions(scrambleOptions);
        const font = resolveFont(scrambleOptions);
        validateText(text, font);
        return scrambleWithLease(text, scrambleOptions, ensureLease());
      };
      const scrambleAsync = async (
        text: string,
        scrambleOptions: ScrambleOptions,
        acquisition: GlyphAcquisitionOptions = {},
      ): Promise<GlyphPayload> => {
        assertGlyphPayloadOptions(scrambleOptions);
        const font = resolveFont(scrambleOptions);
        validateText(text, font);
        const responseLease = await ensureLeaseAsync(acquisition);
        return scrambleWithLease(text, scrambleOptions, responseLease);
      };
      return {
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
        scramble,
        scrambleAsync,
        protect(
          text: string,
          scrambleOptions: OptionalScrambleOptions,
        ): GlyphProtectionResult {
          try {
            return {
              status: "protected",
              payload: scramble(text, scrambleOptions),
            };
          } catch (error) {
            if (!(error instanceof GlyphContentError)) throw error;
            return { status: "omitted", error: error.diagnostic() };
          }
        },
        async protectAsync(
          text: string,
          scrambleOptions: OptionalScrambleOptions,
          acquisition: GlyphAcquisitionOptions = {},
        ): Promise<GlyphProtectionResult> {
          try {
            return {
              status: "protected",
              payload: await scrambleAsync(text, scrambleOptions, acquisition),
            };
          } catch (error) {
            if (!(error instanceof GlyphContentError)) throw error;
            return { status: "omitted", error: error.diagnostic() };
          }
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

    capacityReport(targetResponsesPerSecond?: number) {
      return variantProvider.capacityReport(
        config.rotation.tokenTtlSeconds,
        targetResponsesPerSecond,
      );
    },

    async drain(drainOptions: GlyphDrainOptions = {}): Promise<void> {
      if (drainOptions.timeoutMs !== undefined)
        assertTimerDelay(drainOptions.timeoutMs, "Engine drain timeout");
      await variantProvider.drain(drainOptions);
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
