import { describe, expect, it, vi } from "vitest";
import {
  glyphResponseBoundaryAttributes,
  transformGlyphHtmlResponse,
} from "../src/response-boundary.js";
import type {
  GlyphPayload,
  OptionalScrambleOptions,
  ResponseContext,
  ScrambleOptions,
} from "../src/types.js";

function encode(text: string, offset: number): string {
  return [...text]
    .map((value) =>
      /[A-Za-z]/u.test(value)
        ? String.fromCodePoint(value.codePointAt(0)! + offset)
        : value,
    )
    .join("");
}

function fakeContext(offset = 1): ResponseContext {
  let used = false;
  const scramble = (text: string, options: ScrambleOptions): GlyphPayload => {
    used = true;
    return {
      version: 3,
      encodedText: encode(text, offset),
      font: options.font,
      face: {
        id: "default",
        family: `GlyphScramble-${options.font}-default-0123456789abcdef`,
        weight: "400",
        style: "normal",
        stretch: "normal",
        unicodeRange: ["U+20-7E"],
      },
      fontUrl: `/_glyphscramble/font/token-${offset}/${options.font}%40default.woff2`,
      expiresAt: 2_000_000_000_000,
      coverage: "a".repeat(64),
      ...(options.lang ? { lang: options.lang } : {}),
      ...(options.cspNonce ? { cspNonce: options.cspNonce } : {}),
    } as GlyphPayload;
  };
  return {
    get used() {
      return used;
    },
    usage: () => ({
      used,
      authorizedFaces: used ? ["body@default"] : [],
      usedFaces: used ? ["body@default"] : [],
    }),
    scramble,
    scrambleAsync: async (text, options) => scramble(text, options),
    protect(text: string, options: OptionalScrambleOptions) {
      return { status: "protected", payload: scramble(text, options) };
    },
    async protectAsync(text: string, options: OptionalScrambleOptions) {
      return { status: "protected" as const, payload: scramble(text, options) };
    },
  };
}

function html(body: string, headers: HeadersInit = {}): Response {
  return new Response(
    `<!doctype html><html><head><title>Public title</title></head><body>${body}</body></html>`,
    {
      headers: { "content-type": "text/html; charset=utf-8", ...headers },
    },
  );
}

describe("response boundary markers", () => {
  it("emits only the versioned response marker", () => {
    expect(glyphResponseBoundaryAttributes("body")).toEqual({
      "data-glyphscramble-font": "body",
      "data-glyphscramble-source": "response-boundary-v1",
    });
    expect(() => glyphResponseBoundaryAttributes("Body Font")).toThrow(
      /configured GlyphScramble font id/,
    );
  });
});

describe("transformGlyphHtmlResponse", () => {
  it("protects a nested inert component and applies private caching", async () => {
    const source = "High value research summary";
    const response = await transformGlyphHtmlResponse(
      html(
        `<article class="research" data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1"><h2>${source}</h2><p lang="en">Dataset details</p></article>`,
        { "cache-control": "public, max-age=3600", etag: '"plain"' },
      ),
      fakeContext(),
    );
    const output = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-glyphscramble")).toBe("response-rotated");
    expect(response.headers.get("etag")).toBeNull();
    expect(output).not.toContain(source);
    expect(output).not.toContain("Dataset details");
    expect(output).toContain('data-glyphscramble-source="response-output-v1"');
    expect(output).toContain('data-glyphscramble-state="loading"');
    expect(output).toContain("glyphscramble-response-runtime");
    expect(output).toContain("glyphscramble-response-style");
    expect(output).toContain("Public title");
  });

  it("uses a fresh context mapping for each response", async () => {
    const marked = html(
      '<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Protected value</article>',
    );
    const first = await transformGlyphHtmlResponse(marked, fakeContext(1));
    const second = await transformGlyphHtmlResponse(
      html(
        '<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Protected value</article>',
      ),
      fakeContext(2),
    );
    expect(await first.text()).not.toBe(await second.text());
  });

  it("shares one variant across sibling and nested same-font boundaries", async () => {
    const response = await transformGlyphHtmlResponse(
      html(
        '<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Outer value <section data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Nested value</section></article><aside data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Sibling value</aside>',
      ),
      fakeContext(),
    );
    const output = await response.text();
    expect(response.status).toBe(200);
    expect(
      output.match(
        /<(?:article|aside)[^>]+data-glyphscramble-state="loading"/gu,
      ),
    ).toHaveLength(2);
    expect(output.match(/data-glyphscramble-response-style/gu)).toHaveLength(1);
    expect(output.match(/data-glyphscramble-response-runtime/gu)).toHaveLength(
      1,
    );
    expect(output).not.toContain("response-boundary-v1");
    expect(output).not.toMatch(/(?:Outer|Nested|Sibling) value/u);
  });

  it("preserves an unmarked response and its cache policy", async () => {
    const response = await transformGlyphHtmlResponse(
      html("<p>Ordinary content</p>", {
        "cache-control": "public, max-age=3600",
      }),
      fakeContext(),
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("x-glyphscramble")).toBeNull();
    expect(await response.text()).toContain("Ordinary content");
  });

  it.each([
    ["interactive content", "<button>Protected value</button>"],
    ["hydrated content", "<astro-island><p>Protected value</p></astro-island>"],
    [
      "inline font override",
      '<p style="font-family: serif">Protected value</p>',
    ],
    [
      "plaintext attribute",
      '<p aria-label="Protected value">Protected value</p>',
    ],
  ])("fails closed for %s", async (_name, child) => {
    const diagnostic = vi.fn();
    const response = await transformGlyphHtmlResponse(
      html(
        `<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">${child}</article>`,
      ),
      fakeContext(),
      { onDiagnostic: diagnostic },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("Protected content unavailable.");
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(
      "Protected value",
    );
  });

  it("refuses static, bare, and mixed-font markers", async () => {
    for (const body of [
      '<article data-glyphscramble-font="body" data-glyphscramble-source="static-boundary-v1">Protected value</article>',
      '<article data-glyphscramble-font="body">Protected value</article>',
      '<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Protected value</article><aside data-glyphscramble-font="other" data-glyphscramble-source="response-boundary-v1">Other protected value</aside>',
    ]) {
      const response = await transformGlyphHtmlResponse(
        html(body),
        fakeContext(),
      );
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("Protected value");
    }
  });

  it("enforces the buffer ceiling without reporting content", async () => {
    const diagnostic = vi.fn();
    const response = await transformGlyphHtmlResponse(
      html(
        '<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Protected value</article>',
      ),
      fakeContext(),
      { maxBytes: 32, onDiagnostic: diagnostic },
    );
    expect(response.status).toBe(503);
    expect(diagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: "buffer-overflow", phase: "buffer" }),
    );
  });

  it.each([
    [
      "incomplete document",
      '<!doctype html><html><head></head><body><article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Protected value</article>',
    ],
    [
      "malformed document",
      '<!doctype html><html><head></head><body><article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1" id="first" id="second">Protected value</article></body></html>',
    ],
  ])("fails closed for an %s", async (_name, source) => {
    const response = await transformGlyphHtmlResponse(
      new Response(source, {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      fakeContext(),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Protected content unavailable.");
  });

  it("fails closed when response-owned output duplicates protected source", async () => {
    const sentinel = "private-boundary-sentinel-value";
    const response = await transformGlyphHtmlResponse(
      html(
        `<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">${sentinel}</article><script>globalThis.copy=${JSON.stringify(sentinel)}</script>`,
      ),
      fakeContext(),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(sentinel);
  });

  it("returns content-free abort and timeout failures", async () => {
    const aborted = new AbortController();
    aborted.abort(new DOMException("caller stopped", "AbortError"));
    const abortDiagnostic = vi.fn();
    const abortResponse = await transformGlyphHtmlResponse(
      html(
        '<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Abort secret marker</article>',
      ),
      fakeContext(),
      { signal: aborted.signal, onDiagnostic: abortDiagnostic },
    );
    expect(abortResponse.status).toBe(503);
    expect(abortDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: "abort", phase: "buffer" }),
    );

    const timeoutDiagnostic = vi.fn();
    let delayed: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          delayed = setTimeout(() => {
            controller.enqueue(new TextEncoder().encode("delayed secret"));
            controller.close();
          }, 100);
        },
        cancel() {
          clearTimeout(delayed);
        },
      }),
      {
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
    const timeoutResponse = await transformGlyphHtmlResponse(
      stalled,
      fakeContext(),
      { timeoutMs: 5, onDiagnostic: timeoutDiagnostic },
    );
    expect(timeoutResponse.status).toBe(503);
    expect(timeoutDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: "timeout", phase: "buffer" }),
    );
    expect(JSON.stringify(timeoutDiagnostic.mock.calls)).not.toContain(
      "secret",
    );
  });

  it("requires an authorized nonce when a CSP is present", async () => {
    const markup =
      '<article data-glyphscramble-font="body" data-glyphscramble-source="response-boundary-v1">Protected value</article>';
    const refused = await transformGlyphHtmlResponse(
      html(markup, {
        "content-security-policy": "default-src 'self'",
      }),
      fakeContext(),
    );
    expect(refused.status).toBe(503);

    const allowed = await transformGlyphHtmlResponse(
      html(markup, {
        "content-security-policy":
          "default-src 'none'; script-src 'nonce-safe123'; style-src 'nonce-safe123'; font-src 'self'",
      }),
      fakeContext(),
      { cspNonce: "safe123" },
    );
    expect(allowed.status).toBe(200);
    const output = await allowed.text();
    expect(output).toContain('nonce="safe123"');
    expect(output).not.toContain("Protected value");
  });
});
