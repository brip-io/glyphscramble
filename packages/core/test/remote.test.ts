import { describe, expect, it, vi } from "vitest";
import { validateGlyphConfig } from "../src/config.js";
import {
  assertRemoteDestination,
  fetchBounded,
  type HostResolver,
} from "../src/remote.js";
import type { GlyphConfig } from "../src/types.js";
import { syntheticFont } from "./fixture.js";

function config(remote: GlyphConfig["remote"] = {}): GlyphConfig {
  return {
    fonts: {
      body: {
        source: { kind: "file", path: "font.woff2" },
        license: { spdx: "OFL-1.1", file: "OFL.txt" },
      },
    },
    rotation: {
      scope: "response",
      secretEnv: "GLYPHSCRAMBLE_SECRET",
      tokenTtlSeconds: 600,
    },
    routePrefix: "/_glyphscramble",
    unsupported: "error",
    accessibilityRiskAcknowledged: true,
    remote,
  };
}

const publicResolver: HostResolver = async () => ["8.8.8.8"];

describe("bounded remote input", () => {
  it("denies private destinations and permits an explicit build-network override", async () => {
    await expect(
      assertRemoteDestination(new URL("https://127.0.0.1/font.woff2")),
    ).rejects.toThrow(/denied address/);
    await expect(
      assertRemoteDestination(new URL("https://[::1]/font.woff2")),
    ).rejects.toThrow(/denied address/);
    await expect(
      assertRemoteDestination(new URL("https://[64:ff9b::7f00:1]/font.woff2")),
    ).rejects.toThrow(/denied address/);
    await expect(
      assertRemoteDestination(new URL("https://[::c0a8:1]/font.woff2")),
    ).rejects.toThrow(/denied address/);
    await expect(
      assertRemoteDestination(new URL("https://[::ffff:c0a8:1]/font.woff2")),
    ).rejects.toThrow(/denied address/);
    await expect(
      assertRemoteDestination(new URL("https://[::ffff:808:808]/font.woff2")),
    ).resolves.toBeUndefined();
    await expect(
      assertRemoteDestination(new URL("https://fonts.internal/font.woff2")),
    ).rejects.toThrow(/hostname is denied/);
    await expect(
      assertRemoteDestination(new URL("https://127.0.0.1/font.woff2"), {
        allowPrivateHosts: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("revalidates every redirect target before fetching it", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://private.example/font.woff2" },
        }),
    );
    const resolver: HostResolver = async (hostname) =>
      hostname === "private.example" ? ["127.0.0.1"] : ["8.8.8.8"];
    await expect(
      fetchBounded("https://public.example/font.woff2", {
        accept: "font/woff2",
        config: config(),
        fetcher,
        kind: "font",
        resolver,
        userAgent: "GlyphScramble test",
      }),
    ).rejects.toThrow(/denied address/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("classifies redirects without Location before applying the redirect bound", async () => {
    for (const status of [302, 304])
      await expect(
        fetchBounded("https://public.example/font.woff2", {
          accept: "font/woff2",
          config: config({ maxRedirects: 0 }),
          fetcher: async () => new Response(null, { status }),
          kind: "font",
          resolver: publicResolver,
          userAgent: "GlyphScramble test",
        }),
      ).rejects.toThrow(
        new RegExp(`redirect ${status} without a Location header`),
      );
  });

  it("bounds DNS resolution within the hop deadline", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      fetchBounded("https://public.example/font.woff2", {
        accept: "font/woff2",
        config: config({ timeoutMs: 10, totalTimeoutMs: 20 }),
        fetcher,
        kind: "font",
        resolver: async () => new Promise<never>(() => {}),
        userAgent: "GlyphScramble test",
      }),
    ).rejects.toThrow(/DNS timeout/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds a non-cooperative injected fetch implementation", async () => {
    await expect(
      fetchBounded("https://public.example/font.woff2", {
        accept: "font/woff2",
        config: config({ timeoutMs: 10, totalTimeoutMs: 20 }),
        fetcher: async () => new Promise<Response>(() => {}),
        kind: "font",
        userAgent: "GlyphScramble test",
      }),
    ).rejects.toThrow(/hop timeout/);
  });

  it("cancels a chunked response as soon as it crosses the byte limit", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        canceled = true;
      },
    });
    await expect(
      fetchBounded("https://public.example/font.woff2", {
        accept: "font/woff2",
        config: config({ maxBytes: 7 }),
        fetcher: async () =>
          new Response(body, { headers: { "content-type": "font/woff2" } }),
        kind: "font",
        resolver: publicResolver,
        userAgent: "GlyphScramble test",
      }),
    ).rejects.toThrow(/exceeds 7 bytes/);
    expect(canceled).toBe(true);
  });

  it("rejects media-type and magic mismatches", async () => {
    const request = (kind: "css" | "font", response: Response) =>
      fetchBounded(`https://public.example/${kind}`, {
        accept: "*/*",
        config: config(),
        fetcher: async () => response,
        kind,
        resolver: publicResolver,
        userAgent: "GlyphScramble test",
      });
    await expect(
      request(
        "css",
        new Response("body{}", { headers: { "content-type": "text/html" } }),
      ),
    ).rejects.toThrow(/unsupported Content-Type/);
    await expect(
      request(
        "font",
        new Response("not a font", {
          headers: { "content-type": "font/woff2" },
        }),
      ),
    ).rejects.toThrow(/unsupported magic/);
  });

  it("accepts a bounded font and treats zero redirects as valid policy", async () => {
    expect(() =>
      validateGlyphConfig(config({ maxRedirects: 0 })),
    ).not.toThrow();
    expect(() =>
      validateGlyphConfig({
        ...config(),
        maxNormalizedBytes: 16 * 1024 * 1024 + 1,
      }),
    ).toThrow(/maxNormalizedBytes/);
    const result = await fetchBounded("https://public.example/font.ttf", {
      accept: "font/ttf",
      config: config({ maxRedirects: 0 }),
      fetcher: async () =>
        new Response(syntheticFont(), {
          headers: { "content-type": "font/ttf" },
        }),
      kind: "font",
      resolver: publicResolver,
      userAgent: "GlyphScramble test",
    });
    expect(result.bytes).toEqual(syntheticFont());
  });

  it("binds the built-in transport to the validated DNS result", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(
        (init as RequestInit & { dispatcher?: unknown }).dispatcher,
      ).toBeDefined();
      return new Response(syntheticFont(), {
        headers: { "content-type": "font/ttf" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      await fetchBounded("https://public.example/font.ttf", {
        accept: "font/ttf",
        config: config(),
        fetcher: globalThis.fetch,
        kind: "font",
        resolver: publicResolver,
        userAgent: "GlyphScramble test",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
