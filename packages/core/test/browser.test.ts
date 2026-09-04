import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertGlyphPayload,
  glyphCspDirectives,
  mountGlyphPayload,
} from "../src/browser.js";
import { MAX_TIMER_DELAY_MS } from "../src/limits.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class FakeFontFace {
  static created: FakeFontFace[] = [];
  static loadFactory: (face: FakeFontFace) => Promise<FakeFontFace> = (face) =>
    Promise.resolve(face);

  readonly family: string;
  readonly source: string;
  readonly descriptors: FontFaceDescriptors;

  constructor(
    family: string,
    source: string,
    descriptors: FontFaceDescriptors = {},
  ) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    FakeFontFace.created.push(this);
  }

  load(): Promise<FakeFontFace> {
    return FakeFontFace.loadFactory(this);
  }
}

class FakeFontSet {
  readonly faces = new Set<FontFace>();
  readonly deleted: FontFace[] = [];
  readonly loadCalls: Array<{ query: string; text: string }> = [];
  readonly checkCalls: Array<{ query: string; text: string }> = [];
  matchLoads = true;
  checkResult = true;

  add(face: FontFace): this {
    this.faces.add(face);
    return this;
  }

  delete(face: FontFace): boolean {
    this.deleted.push(face);
    return this.faces.delete(face);
  }

  load(query: string, text = " "): Promise<FontFace[]> {
    this.loadCalls.push({ query, text });
    return Promise.resolve(this.matchLoads ? [...this.faces] : []);
  }

  check(query: string, text = " "): boolean {
    this.checkCalls.push({ query, text });
    return this.checkResult;
  }
}

class FakeStyle {
  nonce = "";
  textContent = "";
  removed = false;

  remove(): void {
    this.removed = true;
  }
}

class FakeClassList {
  readonly values = new Set<string>();

  add(value: string): void {
    this.values.add(value);
  }

  remove(value: string): void {
    this.values.delete(value);
  }
}

class FakeElement {
  readonly ownerDocument: Document;
  readonly dataset: DOMStringMap = {};
  readonly style = {
    fontFamily: "original-family",
    fontWeight: "500",
    fontStyle: "normal",
    fontStretch: "normal",
  };
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  hidden = false;
  textContent = "";

  constructor(document: Document) {
    this.ownerDocument = document;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

function environment() {
  const fonts = new FakeFontSet();
  const styles: FakeStyle[] = [];
  const document = {
    defaultView: { FontFace: FakeFontFace },
    fonts,
    createElement: () => new FakeStyle(),
    head: {
      append(style: FakeStyle) {
        styles.push(style);
      },
    },
  } as unknown as Document;
  return {
    document,
    fonts,
    styles,
    element: () => new FakeElement(document) as unknown as HTMLElement,
  };
}

function payload(suffix = "0123456789abcdef") {
  const fontToken = `v2.current.${suffix}`;
  return {
    version: 3,
    encodedText: "Vhfuhw 😀",
    font: "body",
    face: {
      id: "regular",
      family: `GlyphScramble-body-regular-${suffix}`,
      weight: "400",
      style: "normal",
      stretch: "normal",
      unicodeRange: ["U+0020-007E"],
    },
    fontUrl: `/_glyphscramble/font/${fontToken}/body%40regular.woff2`,
    expiresAt: Math.floor(Date.now() / 1_000) + 60,
    coverage: suffix.repeat(4),
    lang: "en-GB",
    cspNonce: "bm9uY2U=",
  };
}

function changed(
  mutate: (value: Record<string, unknown>) => void,
): Record<string, unknown> {
  const value = structuredClone(payload()) as Record<string, unknown>;
  mutate(value);
  return value;
}

afterEach(() => {
  FakeFontFace.created = [];
  FakeFontFace.loadFactory = (face) => Promise.resolve(face);
  vi.useRealTimers();
});

describe("GlyphPayload validation", () => {
  it("accepts the compact data-only v3 wire contract", () => {
    const value: unknown = payload();
    expect(() => assertGlyphPayload(value)).not.toThrow();
  });

  it("rejects a legacy payload with a clear mixed-version diagnostic", () => {
    const value = payload() as Record<string, unknown>;
    value.version = 2;
    expect(() => assertGlyphPayload(value)).toThrow(/cannot be mixed/);
  });

  it("accepts variable face descriptor ranges", () => {
    const value = payload();
    value.face.weight = "100 900";
    value.face.style = "oblique 0deg 10deg";
    value.face.stretch = "75% 125%";
    expect(() => assertGlyphPayload(value)).not.toThrow();
  });

  it.each([
    changed((value) => {
      value.css = "body{display:none}";
    }),
    changed((value) => {
      value.version = 1;
    }),
    changed((value) => {
      value.fontUrl = "https://attacker.test/font.woff2";
    }),
    changed((value) => {
      value.fontUrl =
        "//attacker.test/font/v2.current.0123456789abcdef/body%40regular.woff2";
    }),
    changed((value) => {
      value.fontUrl =
        "/../font/v2.current.0123456789abcdef/body%40regular.woff2";
    }),
    changed((value) => {
      value.fontUrl = "/_glyphscramble/font/another-token/body.woff2";
    }),
    changed((value) => {
      (value.face as Record<string, unknown>).id = "bold";
    }),
    changed((value) => {
      (value.face as Record<string, unknown>).weight = "400;display:block";
    }),
    changed((value) => {
      value.coverage = "not-a-coverage-identity";
    }),
    changed((value) => {
      value.encodedText = "\ud800";
    }),
    changed((value) => {
      value.expiresAt = 0;
    }),
  ])("rejects malformed or executable serialized fields", (value) => {
    expect(() => assertGlyphPayload(value)).toThrow(TypeError);
  });

  it("enforces a serialized byte ceiling", () => {
    expect(() => assertGlyphPayload(payload(), { maxBytes: 128 })).toThrow(
      /byte limit/,
    );
  });

  it("rejects an invalid initial mount synchronously", () => {
    const env = environment();
    const value = changed((candidate) => {
      candidate.css = "@import url(https://attacker.test)";
    });
    expect(() => mountGlyphPayload(env.element(), value)).toThrow(/css/);
    expect(FakeFontFace.created).toHaveLength(0);
  });

  it("rejects timeout and expiry delays beyond the platform timer ceiling", async () => {
    const env = environment();
    expect(() =>
      mountGlyphPayload(env.element(), payload(), {
        timeoutMs: MAX_TIMER_DELAY_MS + 1,
      }),
    ).toThrow(/2147483647/);

    const farFuture = payload();
    farFuture.expiresAt =
      Math.floor((Date.now() + MAX_TIMER_DELAY_MS + 60_000) / 1_000) + 1;
    const mount = mountGlyphPayload(env.element(), farFuture);
    await expect(mount.ready).rejects.toThrow(/2147483647/);
    mount.destroy();
  });
});

describe("font lifecycle", () => {
  it("deduplicates exact faces and releases them after the final mount", async () => {
    const env = environment();
    const firstElement = env.element();
    const secondElement = env.element();
    const value = payload();
    value.encodedText = "😀".repeat(40);
    const first = mountGlyphPayload(firstElement, value);
    const second = mountGlyphPayload(secondElement, value);

    await expect(Promise.all([first.ready, second.ready])).resolves.toEqual([
      "ready",
      "ready",
    ]);
    expect(FakeFontFace.created).toHaveLength(1);
    expect(env.styles).toHaveLength(1);
    expect(env.fonts.loadCalls).toHaveLength(2);
    expect(env.fonts.loadCalls[0]?.query).toBe(
      'normal 400 normal 1em "GlyphScramble-body-regular-0123456789abcdef"',
    );
    expect([...env.fonts.loadCalls[0]!.text]).toHaveLength(32);
    expect(env.fonts.checkCalls[0]).toEqual(env.fonts.loadCalls[0]);
    expect(firstElement.hidden).toBe(false);
    expect(firstElement.dataset.glyphscramble).toBe("ready");
    expect(firstElement.getAttribute("aria-hidden")).toBe("true");
    expect(firstElement.getAttribute("lang")).toBe("en-GB");

    first.destroy();
    expect(env.fonts.deleted).toHaveLength(0);
    expect(env.styles[0]?.removed).toBe(false);
    second.destroy();
    expect(env.fonts.deleted).toHaveLength(0);
    expect(env.styles[0]?.removed).toBe(false);
  });

  it("treats equivalent payload clones as lifecycle no-ops", async () => {
    const env = environment();
    const element = env.element();
    const value = payload();
    const mount = mountGlyphPayload(element, value);
    await expect(mount.ready).resolves.toBe("ready");

    await expect(mount.update(structuredClone(value))).resolves.toBe("ready");
    expect(FakeFontFace.created).toHaveLength(1);
    expect(env.fonts.loadCalls).toHaveLength(1);
    expect(element.dataset.glyphscramble).toBe("ready");
    mount.destroy();
  });

  it("reuses a settled face after all mounts temporarily detach", async () => {
    const env = environment();
    const value = payload();
    const first = mountGlyphPayload(env.element(), value);
    await expect(first.ready).resolves.toBe("ready");
    first.destroy();

    const second = mountGlyphPayload(env.element(), structuredClone(value));
    await expect(second.ready).resolves.toBe("ready");
    expect(FakeFontFace.created).toHaveLength(1);
    second.destroy();
  });

  it("aborts superseded work without mutating the updated element", async () => {
    const env = environment();
    const element = env.element();
    const pending = deferred<FakeFontFace>();
    FakeFontFace.loadFactory = (face) =>
      face.family.endsWith("0123456789abcdef")
        ? pending.promise
        : Promise.resolve(face);
    const mount = mountGlyphPayload(element, payload());
    const next = payload("fedcba9876543210");
    next.encodedText = "Qhaw";

    await expect(mount.update(next)).resolves.toBe("ready");
    await expect(mount.ready).resolves.toBe("aborted");
    pending.resolve(FakeFontFace.created[0]!);
    await Promise.resolve();
    expect(element.textContent).toBe("Qhaw");
    expect(element.dataset.glyphscramble).toBe("ready");
    expect(env.fonts.deleted).toContain(FakeFontFace.created[0]);
    expect(env.fonts.deleted).not.toContain(FakeFontFace.created[1]);

    mount.destroy();
    expect(env.fonts.deleted).not.toContain(FakeFontFace.created[1]);
    expect(element.hidden).toBe(true);
    expect(element.dataset.glyphscramble).toBeUndefined();
  });

  it("times out to a generic aria-hidden error and removes stale resources", async () => {
    vi.useFakeTimers();
    const env = environment();
    const element = env.element();
    FakeFontFace.loadFactory = () => new Promise(() => undefined);
    const mount = mountGlyphPayload(element, payload(), {
      timeoutMs: 10,
      errorText: "Protected block unavailable.",
    });

    await vi.advanceTimersByTimeAsync(10);
    await expect(mount.ready).resolves.toBe("error");
    expect(element.textContent).toBe("Protected block unavailable.");
    expect(element.hidden).toBe(false);
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.dataset.glyphscramble).toBe("error");
    expect(env.fonts.deleted).toHaveLength(1);
    expect(env.styles[0]?.removed).toBe(true);
  });

  it("fails closed when a payload expires after loading", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const env = environment();
    const element = env.element();
    const value = payload();
    value.expiresAt = Math.floor(Date.now() / 1_000) + 1;
    const mount = mountGlyphPayload(element, value, {
      errorText: "Protected block unavailable.",
    });

    await expect(mount.ready).resolves.toBe("ready");
    expect(element.dataset.glyphscramble).toBe("ready");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(element.textContent).toBe("Protected block unavailable.");
    expect(element.dataset.glyphscramble).toBe("error");
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(env.fonts.deleted).toHaveLength(1);
  });

  it("fails when the exact registered face is not returned", async () => {
    const env = environment();
    env.fonts.matchLoads = false;
    const element = env.element();
    const mount = mountGlyphPayload(element, payload());

    await expect(mount.ready).resolves.toBe("error");
    expect(element.dataset.glyphscramble).toBe("error");
    expect(env.fonts.deleted).toHaveLength(1);
  });
});

describe("CSP contract", () => {
  it("uses nonce styles without allowing style attributes", () => {
    expect(glyphCspDirectives("bm9uY2U=")).toEqual({
      "font-src": ["'self'"],
      "style-src": ["'self'", "'nonce-bm9uY2U='"],
      "style-src-elem": ["'self'", "'nonce-bm9uY2U='"],
      "style-src-attr": ["'none'"],
      "script-src": ["'self'"],
    });
    expect(glyphCspDirectives()["style-src-attr"]).toEqual(["'unsafe-inline'"]);
    expect(() => glyphCspDirectives("bad nonce")).toThrow(/nonce/);
  });
});
