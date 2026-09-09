import { performance } from "node:perf_hooks";
import { parse, serialize } from "parse5";
import { assertGlyphPayloadOptions } from "./browser.js";
import {
  protectedResponseHeaders,
  responseHeadersForContext,
} from "./response-headers.js";
import { assertStaticErrorText, assertTimerDelay } from "./limits.js";
import {
  DEFAULT_STATIC_HYDRATION_DETECTORS,
  scanGlyphHtmlDocument,
  StaticBuildPlanError,
  type StaticHtmlNode,
} from "./static-plan.js";
import {
  GLYPH_STATIC_BOUNDARY_ELEMENTS,
  type GlyphStaticBoundaryElement,
} from "./static-boundary.js";
import type {
  GlyphPayload,
  ResponseContext,
  ScrambleOptions,
} from "./types.js";

export const GLYPH_RESPONSE_BOUNDARY_SOURCE = "response-boundary-v1" as const;
const GLYPH_RESPONSE_OUTPUT_SOURCE = "response-output-v1" as const;
export const DEFAULT_RESPONSE_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_RESPONSE_HTML_BYTES = 16 * 1024 * 1024;
export const DEFAULT_RESPONSE_TRANSFORM_TIMEOUT_MS = 1_000;
export const DEFAULT_RESPONSE_FONT_TIMEOUT_MS = 8_000;
const DEFAULT_FAILURE_TEXT = "This protected content could not be displayed.";
const DEFAULT_CLOSED_TEXT = "Protected content unavailable.";
const MARKER_PATTERN = /\bdata-glyphscramble-(?:font|source)\s*=/iu;
const SAFE_FONT_ID = /^[a-z][a-z0-9_-]{0,31}$/iu;
const SAFE_LANG = /^(?:[a-z]{2,8}|x-[a-z0-9]{1,8})(?:-[a-z0-9]{1,8})*$/iu;
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

type HtmlNode = StaticHtmlNode;

export type GlyphResponseBoundaryElement = GlyphStaticBoundaryElement;

export interface GlyphResponseBoundaryAttributes {
  readonly "data-glyphscramble-font": string;
  readonly "data-glyphscramble-source": typeof GLYPH_RESPONSE_BOUNDARY_SOURCE;
}

export type GlyphHtmlTransformDiagnosticCode =
  | "abort"
  | "buffer-overflow"
  | "csp-refused"
  | "invalid-html"
  | "runtime-unavailable"
  | "timeout"
  | "transform-refused";

export interface GlyphHtmlTransformDiagnostic {
  readonly code: GlyphHtmlTransformDiagnosticCode;
  readonly phase: "buffer" | "parse" | "protect";
  readonly durationMs: number;
  readonly bytes?: number;
  readonly errorClass?: string;
}

export interface TransformGlyphHtmlResponseOptions {
  /** Maximum complete HTML response size. Defaults to 2 MiB; hard-capped at 16 MiB. */
  readonly maxBytes?: number;
  /** Complete buffer, validation, and transformation deadline. */
  readonly timeoutMs?: number;
  /** Browser font-load deadline used by the injected fail-closed guard. */
  readonly fontTimeoutMs?: number;
  /** Generic visual error shown if the matching font cannot load. */
  readonly errorText?: string;
  /** Generic plain-text body returned when a marked response cannot be protected. */
  readonly closedText?: string;
  /** Nonce already authorized by the response's CSP for inline script and style elements. */
  readonly cspNonce?: string;
  readonly signal?: AbortSignal;
  /** Aggregate-only callback. Diagnostics never contain source text, tokens, or URLs. */
  readonly onDiagnostic?: (diagnostic: GlyphHtmlTransformDiagnostic) => void;
}

class GlyphHtmlTransformError extends Error {
  constructor(
    readonly code: GlyphHtmlTransformDiagnosticCode,
    readonly phase: GlyphHtmlTransformDiagnostic["phase"],
  ) {
    super(code);
    this.name = "GlyphHtmlTransformError";
  }
}

export function isGlyphResponseBoundaryElement(
  value: unknown,
): value is GlyphResponseBoundaryElement {
  return (
    typeof value === "string" &&
    (GLYPH_STATIC_BOUNDARY_ELEMENTS as readonly string[]).includes(value)
  );
}

/**
 * Framework-neutral marker for a complete, buffered, non-hydrated HTML
 * response. This helper does not encode text; the server response transformer
 * must run before any bytes are committed.
 */
export function glyphResponseBoundaryAttributes(
  font: string,
): GlyphResponseBoundaryAttributes {
  if (!SAFE_FONT_ID.test(font))
    throw new TypeError(
      "GlyphResponseBoundary `font` must be a configured GlyphScramble font id.",
    );
  return Object.freeze({
    "data-glyphscramble-font": font,
    "data-glyphscramble-source": GLYPH_RESPONSE_BOUNDARY_SOURCE,
  });
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum)
    throw new TypeError(`${name} must be between 1 and ${maximum}.`);
  return resolved;
}

function attribute(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name.toLowerCase() === name)?.value;
}

function setAttribute(node: HtmlNode, name: string, value: string): void {
  const current = node.attrs?.find((item) => item.name.toLowerCase() === name);
  if (current) current.value = value;
  else node.attrs = [...(node.attrs ?? []), { name, value }];
}

function deleteAttribute(node: HtmlNode, name: string): void {
  if (!node.attrs) return;
  node.attrs = node.attrs.filter(
    (item) => item.name.toLowerCase() !== name.toLowerCase(),
  );
}

function appendClass(node: HtmlNode, value: string): void {
  const classes = attribute(node, "class")?.split(/\s+/u).filter(Boolean) ?? [];
  if (!classes.includes(value)) classes.push(value);
  setAttribute(node, "class", classes.join(" "));
}

function children(node: HtmlNode): readonly HtmlNode[] {
  return [...(node.childNodes ?? []), ...(node.content?.childNodes ?? [])];
}

function walk(node: HtmlNode, visit: (node: HtmlNode) => void): void {
  visit(node);
  for (const child of children(node)) walk(child, visit);
}

function hasProtectedAncestor(node: HtmlNode): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (attribute(parent, "data-glyphscramble-font") !== undefined) return true;
    parent = parent.parentNode;
  }
  return false;
}

function protectedBlocks(document: HtmlNode): HtmlNode[] {
  const blocks: HtmlNode[] = [];
  walk(document, (node) => {
    if (
      attribute(node, "data-glyphscramble-font") !== undefined &&
      !hasProtectedAncestor(node)
    )
      blocks.push(node);
  });
  return blocks;
}

function nearestLang(node: HtmlNode): string | undefined {
  let current: HtmlNode | undefined = node.parentNode;
  while (current) {
    const lang = attribute(current, "lang");
    if (lang && SAFE_LANG.test(lang)) return lang;
    current = current.parentNode;
  }
  return undefined;
}

function textNodes(node: HtmlNode): HtmlNode[] {
  const result: HtmlNode[] = [];
  walk(node, (child) => {
    if (
      child.nodeName === "#text" &&
      typeof child.value === "string" &&
      child.value.length > 0
    )
      result.push(child);
  });
  return result;
}

function appendHeadNode(document: HtmlNode, node: HtmlNode): void {
  let head: HtmlNode | undefined;
  walk(document, (candidate) => {
    if (candidate.tagName === "head") head = candidate;
  });
  if (!head) throw new GlyphHtmlTransformError("invalid-html", "parse");
  node.parentNode = head;
  head.childNodes = [...(head.childNodes ?? []), node];
}

function textNode(value: string, parent: HtmlNode): HtmlNode {
  return { nodeName: "#text", value, parentNode: parent };
}

function statusNode(parent: HtmlNode, errorText: string): HtmlNode {
  const status: HtmlNode = {
    nodeName: "span",
    tagName: "span",
    namespaceURI: HTML_NAMESPACE,
    attrs: [
      { name: "class", value: "glyphscramble-response-status" },
      { name: "data-glyphscramble-response-status", value: "pending" },
      { name: "role", value: "status" },
      { name: "aria-live", value: "polite" },
    ],
    childNodes: [],
    parentNode: parent,
  };
  status.childNodes = [textNode(errorText, status)];
  return status;
}

function faceCss(payload: GlyphPayload, fontTimeoutMs: number): string {
  const family = JSON.stringify(payload.face.family);
  const url = JSON.stringify(payload.fontUrl);
  return `@font-face{font-family:${family};src:url(${url}) format("woff2");font-weight:${payload.face.weight};font-style:${payload.face.style};font-stretch:${payload.face.stretch};unicode-range:${payload.face.unicodeRange.join(",")};font-display:block}\n[data-glyphscramble-source="${GLYPH_RESPONSE_OUTPUT_SOURCE}"],[data-glyphscramble-source="${GLYPH_RESPONSE_OUTPUT_SOURCE}"] *{font-family:${family}!important}\n.glyphscramble-response-status{visibility:visible}.glyphscramble-response-status[data-glyphscramble-response-status="pending"]{animation:glyphscramble-response-pending ${fontTimeoutMs}ms step-end}.glyphscramble-response-status[data-glyphscramble-response-status="error"]{visibility:visible}@keyframes glyphscramble-response-pending{from{visibility:hidden}to{visibility:hidden}}\n`;
}

function guardScript(fontTimeoutMs: number): string {
  return `(()=>{const run=()=>{const t=${fontTimeoutMs};for(const e of document.querySelectorAll('[data-glyphscramble-source="${GLYPH_RESPONSE_OUTPUT_SOURCE}"][data-glyphscramble-state="loading"]')){const s=e.nextElementSibling;const fail=()=>{e.hidden=true;e.dataset.glyphscrambleState='error';if(s instanceof HTMLElement&&s.hasAttribute('data-glyphscramble-response-status'))s.dataset.glyphscrambleResponseStatus='error'};(async()=>{let timer;try{if(!(s instanceof HTMLElement)||!s.hasAttribute('data-glyphscramble-response-status'))throw 0;const family=e.dataset.glyphscrambleFamily;if(!family)throw 0;const rootStyle=getComputedStyle(e);if(!rootStyle.fontFamily.includes(family))throw 0;const query=rootStyle.font||rootStyle.fontSize+' '+rootStyle.fontFamily;let text='';for(const n of [e,...e.querySelectorAll('*')]){const value=[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent||'').join('');if(!value)continue;if(!getComputedStyle(n).fontFamily.includes(family))throw 0;text+=value}if(!text)throw 0;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('font timeout')),t)});const loaded=await Promise.race([document.fonts.load(query,text),timeout]);if(!Array.isArray(loaded)||loaded.length===0||!document.fonts.check(query,text))throw 0;clearTimeout(timer);s.hidden=true;s.dataset.glyphscrambleResponseStatus='ready';e.dataset.glyphscrambleState='ready';e.hidden=false}catch{clearTimeout(timer);fail()}})()}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run()})();\n`;
}

function nonceAttribute(
  nonce: string | undefined,
): { name: string; value: string }[] {
  return nonce ? [{ name: "nonce", value: nonce }] : [];
}

function injectRuntime(
  document: HtmlNode,
  payload: GlyphPayload,
  fontTimeoutMs: number,
  nonce: string | undefined,
): void {
  const style: HtmlNode = {
    nodeName: "style",
    tagName: "style",
    namespaceURI: HTML_NAMESPACE,
    attrs: [
      { name: "data-glyphscramble-response-style", value: "v1" },
      ...nonceAttribute(nonce),
    ],
    childNodes: [],
  };
  style.childNodes = [textNode(faceCss(payload, fontTimeoutMs), style)];
  appendHeadNode(document, style);
  const script: HtmlNode = {
    nodeName: "script",
    tagName: "script",
    namespaceURI: HTML_NAMESPACE,
    attrs: [
      { name: "data-glyphscramble-response-runtime", value: "v1" },
      ...nonceAttribute(nonce),
    ],
    childNodes: [],
  };
  script.childNodes = [textNode(guardScript(fontTimeoutMs), script)];
  appendHeadNode(document, script);
}

function cspDirective(policy: string, name: string): string | undefined {
  return policy
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.toLowerCase().startsWith(`${name} `));
}

function assertCspAllowsRuntime(
  headers: Headers,
  nonce: string | undefined,
): void {
  const policy = headers.get("content-security-policy");
  if (!policy) return;
  if (!nonce) throw new GlyphHtmlTransformError("csp-refused", "protect");
  const token = `'nonce-${nonce}'`;
  const script =
    cspDirective(policy, "script-src-elem") ??
    cspDirective(policy, "script-src") ??
    cspDirective(policy, "default-src");
  const style =
    cspDirective(policy, "style-src-elem") ??
    cspDirective(policy, "style-src") ??
    cspDirective(policy, "default-src");
  if (!script?.includes(token) || !style?.includes(token))
    throw new GlyphHtmlTransformError("csp-refused", "protect");
}

function combinedSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBounded(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > maxBytes)
    throw new GlyphHtmlTransformError("buffer-overflow", "buffer");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => void reader.cancel(signal.reason).catch(() => undefined);
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal.aborted)
        throw new GlyphHtmlTransformError(
          signal.reason?.name === "TimeoutError" ? "timeout" : "abort",
          "buffer",
        );
      const { done, value } = await reader.read();
      // Cancelling a reader resolves its pending read with `done: true`; check
      // the signal again so an abort cannot be mistaken for an empty success.
      if (signal.aborted)
        throw new GlyphHtmlTransformError(
          signal.reason?.name === "TimeoutError" ? "timeout" : "abort",
          "buffer",
        );
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new GlyphHtmlTransformError("buffer-overflow", "buffer");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof GlyphHtmlTransformError) throw error;
    if (signal.aborted)
      throw new GlyphHtmlTransformError(
        signal.reason?.name === "TimeoutError" ? "timeout" : "abort",
        "buffer",
      );
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
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

function rebuiltResponse(
  response: Response,
  bytes: Uint8Array,
  headers: Headers,
): Response {
  headers.set("content-length", String(bytes.byteLength));
  return new Response(bytes.buffer as ArrayBuffer, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function closedResponse(text: string): Response {
  return new Response(text, {
    status: 503,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-glyphscramble": "response-failed",
    },
  });
}

function diagnosticCode(error: unknown): {
  code: GlyphHtmlTransformDiagnosticCode;
  phase: GlyphHtmlTransformDiagnostic["phase"];
} {
  if (error instanceof GlyphHtmlTransformError)
    return { code: error.code, phase: error.phase };
  if (error instanceof StaticBuildPlanError)
    return { code: "transform-refused", phase: "parse" };
  return { code: "runtime-unavailable", phase: "protect" };
}

function ensureDeadline(signal: AbortSignal, phase: "parse" | "protect"): void {
  if (!signal.aborted) return;
  throw new GlyphHtmlTransformError(
    signal.reason?.name === "TimeoutError" ? "timeout" : "abort",
    phase,
  );
}

function assertCompleteHtml(source: string): void {
  if (
    !/<html(?:\s|>)/iu.test(source) ||
    !/<head(?:\s|>)/iu.test(source) ||
    !/<body(?:\s|>)/iu.test(source) ||
    !/<\/body\s*>/iu.test(source) ||
    !/<\/html\s*>/iu.test(source)
  )
    throw new GlyphHtmlTransformError("invalid-html", "parse");
}

async function protectDocument(
  document: HtmlNode,
  context: ResponseContext,
  options: {
    errorText: string;
    fontTimeoutMs: number;
    nonce?: string;
    signal: AbortSignal;
    timeoutMs: number;
    started: number;
  },
): Promise<{ html: string; payload: GlyphPayload }> {
  const scan = scanGlyphHtmlDocument(
    document,
    "response",
    undefined,
    DEFAULT_STATIC_HYDRATION_DETECTORS,
    {
      source: GLYPH_RESPONSE_BOUNDARY_SOURCE,
      name: "GlyphResponseBoundary",
      requireSource: true,
    },
  );
  if (scan.protectedBlocks === 0)
    throw new GlyphHtmlTransformError("transform-refused", "parse");
  if (scan.fonts.length !== 1)
    throw new GlyphHtmlTransformError("transform-refused", "parse");
  ensureDeadline(options.signal, "parse");

  const blocks = protectedBlocks(document);
  const nodes = blocks.flatMap(textNodes);
  if (nodes.length === 0)
    throw new GlyphHtmlTransformError("transform-refused", "parse");
  const first = nodes[0]!;
  const originalText = scan.protectedText.map((span) => span.text);
  const font = scan.fonts[0]!;
  const remaining = Math.max(
    1,
    Math.floor(options.timeoutMs - (performance.now() - options.started)),
  );
  const firstLang = nearestLang(first);
  const firstOptions: ScrambleOptions = {
    font,
    ...(firstLang ? { lang: firstLang } : {}),
    ...(options.nonce ? { cspNonce: options.nonce } : {}),
  };
  const payload = await context.scrambleAsync(first.value ?? "", firstOptions, {
    timeoutMs: remaining,
    signal: options.signal,
  });
  if (first.value?.trim() && payload.encodedText === first.value)
    throw new GlyphHtmlTransformError("runtime-unavailable", "protect");
  first.value = payload.encodedText;
  for (const node of nodes.slice(1)) {
    ensureDeadline(options.signal, "protect");
    const lang = nearestLang(node);
    const nodePayload = context.scramble(node.value ?? "", {
      font,
      ...(lang ? { lang } : {}),
      ...(options.nonce ? { cspNonce: options.nonce } : {}),
    });
    if (
      nodePayload.face.family !== payload.face.family ||
      nodePayload.fontUrl !== payload.fontUrl
    )
      throw new GlyphHtmlTransformError("runtime-unavailable", "protect");
    if (node.value?.trim() && nodePayload.encodedText === node.value)
      throw new GlyphHtmlTransformError("runtime-unavailable", "protect");
    node.value = nodePayload.encodedText;
  }

  for (const block of blocks) {
    const parent = block.parentNode;
    if (!parent) throw new GlyphHtmlTransformError("invalid-html", "parse");
    appendClass(block, "glyphscramble-response-protected");
    setAttribute(
      block,
      "data-glyphscramble-source",
      GLYPH_RESPONSE_OUTPUT_SOURCE,
    );
    setAttribute(block, "data-glyphscramble-family", payload.face.family);
    setAttribute(block, "data-glyphscramble-state", "loading");
    setAttribute(block, "aria-hidden", "true");
    setAttribute(block, "hidden", "");
    walk(block, (descendant) => {
      if (descendant === block) return;
      if (
        attribute(descendant, "data-glyphscramble-source") ===
        GLYPH_RESPONSE_BOUNDARY_SOURCE
      ) {
        deleteAttribute(descendant, "data-glyphscramble-font");
        deleteAttribute(descendant, "data-glyphscramble-source");
      }
    });
    const siblings = parent.childNodes ?? [];
    const index = siblings.indexOf(block);
    if (index < 0) throw new GlyphHtmlTransformError("invalid-html", "parse");
    siblings.splice(index + 1, 0, statusNode(parent, options.errorText));
    parent.childNodes = siblings;
  }
  injectRuntime(document, payload, options.fontTimeoutMs, options.nonce);
  const html = serialize(document as never);
  // A response renderer can duplicate server text into an attribute, script,
  // or sibling after the marker was authored. Refuse recognizable source
  // spans instead of publishing a response-owned plaintext side channel.
  for (const source of originalText) {
    const candidate = source.trim();
    if (candidate.length >= 8 && html.includes(candidate))
      throw new GlyphHtmlTransformError("transform-refused", "protect");
  }
  return { html, payload };
}

/**
 * Buffer and transform one complete inert HTML response before any bytes are
 * returned. Marked failures return a generic 503 and never fall back to the
 * original response. Callers that need unprotected streaming should bypass
 * this primitive using an explicit route predicate.
 */
export async function transformGlyphHtmlResponse(
  response: Response,
  context: ResponseContext,
  options: TransformGlyphHtmlResponseOptions = {},
): Promise<Response> {
  const started = performance.now();
  const maxBytes = boundedInteger(
    options.maxBytes,
    DEFAULT_RESPONSE_HTML_BYTES,
    MAX_RESPONSE_HTML_BYTES,
    "Response HTML maxBytes",
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_RESPONSE_TRANSFORM_TIMEOUT_MS;
  assertTimerDelay(timeoutMs, "Response HTML transform timeout");
  const fontTimeoutMs =
    options.fontTimeoutMs ?? DEFAULT_RESPONSE_FONT_TIMEOUT_MS;
  assertTimerDelay(fontTimeoutMs, "Response boundary font timeout");
  const errorText = options.errorText ?? DEFAULT_FAILURE_TEXT;
  const closedText = options.closedText ?? DEFAULT_CLOSED_TEXT;
  assertStaticErrorText(errorText, "Response boundary errorText");
  assertStaticErrorText(closedText, "Response boundary closedText");
  if (options.cspNonce !== undefined)
    assertGlyphPayloadOptions({ cspNonce: options.cspNonce });
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) return response;
  const encoding = response.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity")
    return closedResponse(closedText);
  const signal = combinedSignal(options.signal, timeoutMs);
  let bytes = 0;
  try {
    const body = await readBounded(response, maxBytes, signal);
    bytes = body.byteLength;
    const source = new TextDecoder("utf-8", { fatal: true }).decode(body);
    if (!MARKER_PATTERN.test(source))
      return rebuiltResponse(
        response,
        body,
        responseHeadersForContext(context, response.headers),
      );
    if (response.status < 200 || response.status >= 300)
      throw new GlyphHtmlTransformError("transform-refused", "parse");
    assertCompleteHtml(source);
    ensureDeadline(signal, "parse");
    const parseErrors: unknown[] = [];
    const document = parse(source, {
      onParseError: (error) => parseErrors.push(error),
    }) as unknown as HtmlNode;
    if (parseErrors.length > 0)
      throw new GlyphHtmlTransformError("invalid-html", "parse");
    assertCspAllowsRuntime(response.headers, options.cspNonce);
    const protectedResult = await protectDocument(document, context, {
      errorText,
      fontTimeoutMs,
      signal,
      timeoutMs,
      started,
      ...(options.cspNonce ? { nonce: options.cspNonce } : {}),
    });
    ensureDeadline(signal, "protect");
    const output = new TextEncoder().encode(protectedResult.html);
    const headers = protectedResponseHeaders(response.headers);
    headers.delete("content-encoding");
    headers.delete("etag");
    headers.delete("content-md5");
    return rebuiltResponse(response, output, headers);
  } catch (error) {
    const detail = diagnosticCode(error);
    options.onDiagnostic?.({
      ...detail,
      durationMs: performance.now() - started,
      ...(bytes > 0 ? { bytes } : {}),
      errorClass:
        error instanceof Error ? error.constructor.name : typeof error,
    });
    return closedResponse(closedText);
  }
}
