import type { GlyphPayload } from "./types.js";
import {
  assertCoverageWireBounds,
  assertPayloadWireSize,
  assertTimerDelay,
  MAX_COVERAGE_RANGES,
  MAX_GLYPH_PAYLOAD_BYTES,
  MAX_TIMER_DELAY_MS,
} from "./limits.js";

export { MAX_GLYPH_PAYLOAD_BYTES } from "./limits.js";
const MAX_IDENTIFIER_LENGTH = 32;
const MAX_TOKEN_LENGTH = 8 * 1024;
const MAX_FONT_URL_LENGTH = 16 * 1024;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_-]{0,31}$/i;
const SAFE_FAMILY = /^[a-z][a-z0-9_-]{0,127}$/i;
const SAFE_FONT_URL = /^\/[a-z0-9._~%/-]+$/i;
const SAFE_TOKEN = /^[a-z0-9._-]+$/i;
const SAFE_NONCE = /^[a-z0-9+/_=-]{1,256}$/i;
const SAFE_COVERAGE_IDENTITY = /^[a-f0-9]{64}$/i;
const SAFE_UNICODE_RANGE = /^U\+[0-9A-F?]{1,6}(?:-[0-9A-F]{1,6})?$/;
const SAFE_WEIGHT =
  /^(?:normal|bold|(?:[1-9]\d{0,2}|1000)(?: (?:[1-9]\d{0,2}|1000))?)$/;
const SAFE_STYLE =
  /^(?:normal|italic|oblique(?: -?(?:\d+(?:\.\d+)?|\.\d+)deg(?: -?(?:\d+(?:\.\d+)?|\.\d+)deg)?)?)$/;
const SAFE_STRETCH =
  /^(?:normal|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded|(?:\d+(?:\.\d+)?|\.\d+)%(?: (?:\d+(?:\.\d+)?|\.\d+)%)?)$/;
const SAFE_LANG = /^(?:[a-z]{2,8}|x-[a-z0-9]{1,8})(?:-[a-z0-9]{1,8})*$/i;

export interface MountOptions {
  timeoutMs?: number;
  errorText?: string;
}

export type GlyphMountResult = "ready" | "error" | "aborted";

export interface GlyphMountHandle {
  readonly ready: Promise<GlyphMountResult>;
  update(payload: unknown): Promise<GlyphMountResult>;
  destroy(): void;
}

export interface GlyphCspDirectives {
  readonly "font-src": readonly string[];
  readonly "style-src": readonly string[];
  readonly "style-src-elem": readonly string[];
  readonly "style-src-attr": readonly string[];
  readonly "script-src": readonly string[];
}

interface FaceRegistryEntry {
  refs: number;
  face: FontFace;
  load: Promise<FontFace>;
  settled: boolean;
  expiresAt: number;
  cleanupTimer: ReturnType<typeof setTimeout>;
  lastUsed: number;
  className?: string;
  style?: HTMLStyleElement;
}

interface FaceRegistry {
  nextClass: number;
  entries: Map<string, FaceRegistryEntry>;
}

const registries = new WeakMap<Document, FaceRegistry>();
const MAX_RETAINED_DOCUMENT_FACES = 64;

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  const extra = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (extra) throw new TypeError(`${path}.${extra} is not allowed.`);
}

function stringAt(
  value: unknown,
  path: string,
  options: { min?: number; max: number; pattern?: RegExp },
): string {
  if (
    typeof value !== "string" ||
    value.length < (options.min ?? 1) ||
    value.length > options.max ||
    (options.pattern && !options.pattern.test(value))
  )
    throw new TypeError(`${path} is invalid.`);
  return value;
}

function stringArrayAt(
  value: unknown,
  path: string,
  pattern: RegExp,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_COVERAGE_RANGES
  )
    throw new TypeError(`${path} is invalid.`);
  for (const [index, item] of value.entries())
    stringAt(item, `${path}[${index}]`, { max: 32, pattern });
  assertCoverageWireBounds(value as string[], path);
  return value as string[];
}

function isUnicodeScalarString(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function assertGlyphPayloadOptions(value: {
  lang?: unknown;
  cspNonce?: unknown;
}): void {
  if (value.lang !== undefined)
    stringAt(value.lang, "payload.lang", { max: 64, pattern: SAFE_LANG });
  if (value.cspNonce !== undefined)
    stringAt(value.cspNonce, "payload.cspNonce", {
      max: 256,
      pattern: SAFE_NONCE,
    });
}

/**
 * Validates a payload after JSON/RSC/HTML serialization and narrows it to the
 * branded server-produced type. Unknown fields are rejected so old payloads
 * containing serialized CSS cannot cross this boundary silently.
 */
export function assertGlyphPayload(
  value: unknown,
  options: { maxBytes?: number } = {},
): asserts value is GlyphPayload {
  const payload = objectAt(value, "payload");
  exactKeys(
    payload,
    [
      "version",
      "encodedText",
      "font",
      "face",
      "fontUrl",
      "expiresAt",
      "coverage",
      "lang",
      "cspNonce",
    ],
    "payload",
  );
  if (payload.version !== 3)
    throw new TypeError(
      "payload.version must be 3. GlyphScramble payload versions cannot be mixed; regenerate the payload with the installed server package.",
    );
  const encodedText = stringAt(payload.encodedText, "payload.encodedText", {
    min: 0,
    max: options.maxBytes ?? MAX_GLYPH_PAYLOAD_BYTES,
  });
  if (!isUnicodeScalarString(encodedText))
    throw new TypeError("payload.encodedText must contain Unicode scalars.");
  const font = stringAt(payload.font, "payload.font", {
    max: MAX_IDENTIFIER_LENGTH,
    pattern: SAFE_IDENTIFIER,
  });
  const fontUrl = stringAt(payload.fontUrl, "payload.fontUrl", {
    max: MAX_FONT_URL_LENGTH,
    pattern: SAFE_FONT_URL,
  });
  if (
    !Number.isSafeInteger(payload.expiresAt) ||
    (payload.expiresAt as number) < 1
  )
    throw new TypeError("payload.expiresAt must be a positive Unix timestamp.");

  const face = objectAt(payload.face, "payload.face");
  exactKeys(
    face,
    ["id", "family", "weight", "style", "stretch", "unicodeRange"],
    "payload.face",
  );
  const faceId = stringAt(face.id, "payload.face.id", {
    max: MAX_IDENTIFIER_LENGTH,
    pattern: SAFE_IDENTIFIER,
  });
  const family = stringAt(face.family, "payload.face.family", {
    max: 128,
    pattern: SAFE_FAMILY,
  });
  stringAt(face.weight, "payload.face.weight", {
    max: 32,
    pattern: SAFE_WEIGHT,
  });
  stringAt(face.style, "payload.face.style", {
    max: 64,
    pattern: SAFE_STYLE,
  });
  stringAt(face.stretch, "payload.face.stretch", {
    max: 64,
    pattern: SAFE_STRETCH,
  });
  stringArrayAt(
    face.unicodeRange,
    "payload.face.unicodeRange",
    SAFE_UNICODE_RANGE,
  );

  stringAt(payload.coverage, "payload.coverage", {
    max: 64,
    pattern: SAFE_COVERAGE_IDENTITY,
  });
  assertGlyphPayloadOptions(payload);
  if (
    family !== `GlyphScramble-${font}-${faceId}-${family.slice(-16)}` ||
    !/^[a-f0-9]{16}$/i.test(family.slice(-16))
  )
    throw new TypeError("payload.face.family is inconsistent with its ids.");
  const suffix = `/${font}%40${faceId}.woff2`;
  const token = fontUrl.endsWith(suffix)
    ? fontUrl.slice(0, -suffix.length).split("/").at(-1)
    : undefined;
  if (
    fontUrl.startsWith("//") ||
    /%(?:2f|5c)/i.test(fontUrl) ||
    fontUrl.split("/").some((part) => part === "." || part === "..") ||
    !fontUrl.includes("/font/") ||
    !token ||
    token.length > MAX_TOKEN_LENGTH ||
    !SAFE_TOKEN.test(token) ||
    !fontUrl.endsWith(suffix)
  )
    throw new TypeError("payload.fontUrl is inconsistent with its face.");

  assertPayloadWireSize(payload, options.maxBytes ?? MAX_GLYPH_PAYLOAD_BYTES);
}

function validatedPayloadIdentity(value: GlyphPayload): string {
  return JSON.stringify([
    value.version,
    value.encodedText,
    value.font,
    value.face.id,
    value.face.family,
    value.face.weight,
    value.face.style,
    value.face.stretch,
    value.face.unicodeRange,
    value.fontUrl,
    value.expiresAt,
    value.coverage,
    value.lang ?? null,
    value.cspNonce ?? null,
  ]);
}

/** Stable scalar identity used by adapters and the shared mount lifecycle. */
export function glyphPayloadIdentity(value: unknown): string {
  assertGlyphPayload(value);
  return validatedPayloadIdentity(value);
}

/** CSP sources required by the runtime's same-origin font and bundled script. */
export function glyphCspDirectives(nonce?: string): GlyphCspDirectives {
  if (nonce !== undefined)
    stringAt(nonce, "nonce", { max: 256, pattern: SAFE_NONCE });
  const styleSources = Object.freeze(
    nonce ? ["'self'", `'nonce-${nonce}'`] : ["'self'"],
  );
  return Object.freeze({
    "font-src": Object.freeze(["'self'"]),
    "style-src": styleSources,
    "style-src-elem": styleSources,
    "style-src-attr": Object.freeze(nonce ? ["'none'"] : ["'unsafe-inline'"]),
    "script-src": Object.freeze(["'self'"]),
  });
}

function registryFor(document: Document): FaceRegistry {
  let registry = registries.get(document);
  if (!registry) {
    registry = { nextClass: 0, entries: new Map() };
    registries.set(document, registry);
  }
  return registry;
}

function faceKey(payload: GlyphPayload): string {
  return JSON.stringify([
    payload.coverage,
    payload.face,
    payload.fontUrl,
    payload.expiresAt,
    payload.cspNonce ?? null,
  ]);
}

function faceQuery(payload: GlyphPayload): string {
  return `${payload.face.style} ${payload.face.weight} ${payload.face.stretch} 1em "${payload.face.family}"`;
}

function representativeText(text: string): string {
  return [...text].slice(0, 32).join("") || " ";
}

function discardEntry(
  document: Document,
  registry: FaceRegistry,
  key: string,
  entry: FaceRegistryEntry,
): void {
  if (registry.entries.get(key) !== entry) return;
  registry.entries.delete(key);
  clearTimeout(entry.cleanupTimer);
  document.fonts.delete(entry.face);
  entry.style?.remove();
}

function reserveRegistrySlot(document: Document, registry: FaceRegistry): void {
  if (registry.entries.size < MAX_RETAINED_DOCUMENT_FACES) return;
  const unused = [...registry.entries.entries()]
    .filter(([, entry]) => entry.refs === 0)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
  if (!unused)
    throw new Error(
      `GlyphScramble reached the ${MAX_RETAINED_DOCUMENT_FACES}-face document registry limit.`,
    );
  discardEntry(document, registry, unused[0], unused[1]);
}

function createEntry(
  document: Document,
  registry: FaceRegistry,
  key: string,
  payload: GlyphPayload,
): FaceRegistryEntry {
  const FontFaceConstructor =
    document.defaultView?.FontFace ?? globalThis.FontFace;
  if (!FontFaceConstructor || !document.fonts)
    throw new Error("GlyphScramble requires FontFace and document.fonts.");
  const face = new FontFaceConstructor(
    payload.face.family,
    `url("${payload.fontUrl}") format("woff2")`,
    {
      weight: payload.face.weight,
      style: payload.face.style,
      stretch: payload.face.stretch,
      unicodeRange: payload.face.unicodeRange.join(","),
      display: "block",
    },
  );
  let style: HTMLStyleElement | undefined;
  document.fonts.add(face);
  try {
    const entry = {
      refs: 0,
      face,
      load: undefined as unknown as Promise<FontFace>,
      settled: false,
      expiresAt: payload.expiresAt,
      cleanupTimer: undefined as unknown as ReturnType<typeof setTimeout>,
      lastUsed: Date.now(),
    } as FaceRegistryEntry;
    entry.load = face.load().finally(() => {
      entry.settled = true;
    });
    if (payload.cspNonce) {
      const className = `glyphscramble-face-${++registry.nextClass}`;
      style = document.createElement("style");
      style.nonce = payload.cspNonce;
      style.textContent = `.${className}{font-family:"${payload.face.family}";font-weight:${payload.face.weight};font-style:${payload.face.style};font-stretch:${payload.face.stretch}}`;
      document.head.append(style);
      entry.className = className;
      entry.style = style;
    }
    const delay = Math.max(1, payload.expiresAt * 1_000 - Date.now());
    entry.cleanupTimer = setTimeout(() => {
      if (entry.refs === 0) discardEntry(document, registry, key, entry);
    }, delay);
    (entry.cleanupTimer as unknown as { unref?: () => void }).unref?.();
    return entry;
  } catch (error) {
    document.fonts.delete(face);
    style?.remove();
    throw error;
  }
}

function acquireFace(
  document: Document,
  payload: GlyphPayload,
): { key: string; entry: FaceRegistryEntry } {
  const registry = registryFor(document);
  const key = faceKey(payload);
  let entry = registry.entries.get(key);
  if (!entry) {
    reserveRegistrySlot(document, registry);
    entry = createEntry(document, registry, key, payload);
    registry.entries.set(key, entry);
  }
  entry.refs += 1;
  entry.lastUsed = Date.now();
  return { key, entry };
}

function releaseFace(
  document: Document,
  key: string,
  entry: FaceRegistryEntry,
): void {
  const registry = registryFor(document);
  entry.refs -= 1;
  if (entry.refs > 0 || registry.entries.get(key) !== entry) return;
  entry.lastUsed = Date.now();
  if (!entry.settled || entry.expiresAt * 1_000 <= Date.now())
    discardEntry(document, registry, key, entry);
}

function applyFace(
  element: HTMLElement,
  payload: GlyphPayload,
  entry: FaceRegistryEntry,
): void {
  if (entry.className) {
    element.classList.add(entry.className);
    return;
  }
  element.style.fontFamily = `"${payload.face.family}"`;
  element.style.fontWeight = payload.face.weight;
  element.style.fontStyle = payload.face.style;
  element.style.fontStretch = payload.face.stretch;
}

function removeFace(
  element: HTMLElement,
  entry: FaceRegistryEntry | undefined,
  originalStyle: Pick<
    CSSStyleDeclaration,
    "fontFamily" | "fontWeight" | "fontStyle" | "fontStretch"
  >,
): void {
  if (entry?.className) element.classList.remove(entry.className);
  element.style.fontFamily = originalStyle.fontFamily;
  element.style.fontWeight = originalStyle.fontWeight;
  element.style.fontStyle = originalStyle.fontStyle;
  element.style.fontStretch = originalStyle.fontStretch;
}

/**
 * Mounts a serialized payload, reveals only after its exact face loads, and
 * returns an update/destroy lifecycle used by every framework adapter.
 */
export function mountGlyphPayload(
  element: HTMLElement,
  initialPayload: unknown,
  options: MountOptions = {},
): GlyphMountHandle {
  const document = element.ownerDocument;
  const timeoutMs = options.timeoutMs ?? 8_000;
  assertTimerDelay(timeoutMs, "timeoutMs");
  const originalStyle = {
    fontFamily: element.style.fontFamily,
    fontWeight: element.style.fontWeight,
    fontStyle: element.style.fontStyle,
    fontStretch: element.style.fontStretch,
  };
  const originalLang = element.getAttribute("lang");
  let current:
    | {
        abort: AbortController;
        key: string;
        entry: FaceRegistryEntry;
        expiryTimer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let destroyed = false;
  let semanticIdentity: string | undefined;
  let currentReady: Promise<GlyphMountResult> | undefined;

  const releaseCurrent = (): void => {
    if (!current) return;
    current.abort.abort();
    clearTimeout(current.expiryTimer);
    removeFace(element, current.entry, originalStyle);
    releaseFace(document, current.key, current.entry);
    current = undefined;
  };

  const run = async (payload: GlyphPayload): Promise<GlyphMountResult> => {
    releaseCurrent();
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    element.dataset.glyphscramble = "loading";
    element.textContent = payload.encodedText;
    if (payload.lang) element.setAttribute("lang", payload.lang);
    else element.removeAttribute("lang");
    const expiresInMs = payload.expiresAt * 1_000 - Date.now();
    if (expiresInMs <= 0) {
      element.textContent =
        options.errorText ?? "This protected content could not be displayed.";
      element.dataset.glyphscramble = "error";
      element.hidden = false;
      return "error";
    }
    if (expiresInMs > MAX_TIMER_DELAY_MS)
      throw new TypeError(
        `payload.expiresAt requires a timer greater than ${MAX_TIMER_DELAY_MS} milliseconds.`,
      );

    let acquired: ReturnType<typeof acquireFace>;
    try {
      acquired = acquireFace(document, payload);
    } catch {
      if (!destroyed) {
        element.textContent =
          options.errorText ?? "This protected content could not be displayed.";
        element.dataset.glyphscramble = "error";
        element.hidden = false;
      }
      return "error";
    }
    const abort = new AbortController();
    const expiryTimer = setTimeout(() => {
      if (current?.abort !== abort) return;
      releaseCurrent();
      element.textContent =
        options.errorText ?? "This protected content could not be displayed.";
      element.dataset.glyphscramble = "error";
      element.hidden = false;
    }, expiresInMs);
    current = { abort, expiryTimer, ...acquired };
    applyFace(element, payload, acquired.entry);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("GlyphScramble font load timed out.")),
          timeoutMs,
        );
      });
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("GlyphScramble mount aborted."));
        abort.signal.addEventListener("abort", onAbort, { once: true });
      });
      const loaded = await Promise.race([
        Promise.all([
          acquired.entry.load,
          document.fonts.load(
            faceQuery(payload),
            representativeText(payload.encodedText),
          ),
        ]),
        timeout,
        aborted,
      ]);
      if (
        current?.abort !== abort ||
        abort.signal.aborted ||
        loaded[0] !== acquired.entry.face ||
        !loaded[1].includes(acquired.entry.face) ||
        !document.fonts.check(
          faceQuery(payload),
          representativeText(payload.encodedText),
        ) ||
        (typeof document.defaultView?.getComputedStyle === "function" &&
          !document.defaultView
            .getComputedStyle(element)
            .fontFamily.includes(payload.face.family))
      )
        throw new Error("GlyphScramble exact font face did not load.");
      element.dataset.glyphscramble = "ready";
      element.hidden = false;
      return "ready";
    } catch {
      if (destroyed || abort.signal.aborted || current?.abort !== abort)
        return "aborted";
      removeFace(element, acquired.entry, originalStyle);
      releaseFace(document, acquired.key, acquired.entry);
      discardEntry(
        document,
        registryFor(document),
        acquired.key,
        acquired.entry,
      );
      current = undefined;
      element.textContent =
        options.errorText ?? "This protected content could not be displayed.";
      element.dataset.glyphscramble = "error";
      element.hidden = false;
      return "error";
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort) abort.signal.removeEventListener("abort", onAbort);
    }
  };

  const update = (value: unknown): Promise<GlyphMountResult> => {
    if (destroyed) return Promise.resolve("aborted");
    assertGlyphPayload(value);
    const nextIdentity = validatedPayloadIdentity(value);
    if (nextIdentity === semanticIdentity && currentReady) return currentReady;
    semanticIdentity = nextIdentity;
    currentReady = run(value);
    return currentReady;
  };

  const ready = update(initialPayload);
  return {
    ready,
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releaseCurrent();
      semanticIdentity = undefined;
      currentReady = undefined;
      delete element.dataset.glyphscramble;
      element.hidden = true;
      if (originalLang === null) element.removeAttribute("lang");
      else element.setAttribute("lang", originalLang);
    },
  };
}
