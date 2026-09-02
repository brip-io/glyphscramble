import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compress, decompress } from "woff2-encoder";
import { fontCodepoints, parseSfnt, buildSfnt, type SfntFont } from "./sfnt.js";
import type {
  FontConfig,
  FontFaceMetadata,
  GlyphConfig,
  GlyphLockfile,
} from "./types.js";

const DEFAULT_REMOTE_BYTES = 8 * 1024 * 1024;
const DEFAULT_NORMALIZED_BYTES = 2 * 1024 * 1024;

export interface PreparedFont {
  id: string;
  sfnt: Uint8Array;
  metadata: FontFaceMetadata;
}

async function limitedFetch(
  initialUrl: string,
  config: GlyphConfig,
  accept: string,
  fetcher: typeof fetch,
): Promise<{ bytes: Uint8Array; url: string; contentType: string }> {
  let url = new URL(initialUrl);
  const redirects = config.remote?.maxRedirects ?? 3;
  const maxBytes = config.remote?.maxBytes ?? DEFAULT_REMOTE_BYTES;
  for (let redirect = 0; redirect <= redirects; redirect++) {
    if (url.protocol !== "https:")
      throw new Error(`Remote source must remain HTTPS: ${url}`);
    const response = await fetcher(url, {
      headers: {
        accept,
        "user-agent":
          "GlyphScramble/0.1 (+https://github.com/brip-io/glyphscramble)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(config.remote?.timeoutMs ?? 10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === redirects)
        throw new Error(`Too many redirects while fetching ${initialUrl}`);
      url = new URL(location, url);
      continue;
    }
    if (!response.ok)
      throw new Error(`Remote source ${url} returned ${response.status}.`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes)
      throw new Error(`Remote source exceeds ${maxBytes} bytes.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes)
      throw new Error(`Remote source exceeds ${maxBytes} bytes.`);
    return {
      bytes,
      url: url.href,
      contentType: response.headers.get("content-type") ?? "",
    };
  }
  throw new Error(`Unable to fetch ${initialUrl}`);
}

function fontUrlsFromCss(css: string, base: string): string[] {
  const urls = [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)].map(
    (match) => new URL(match[2]!, base).href,
  );
  return [...new Set(urls.filter((url) => /^https:\/\//i.test(url)))];
}

async function resolveSource(
  font: FontConfig,
  config: GlyphConfig,
  cwd: string,
  fetcher: typeof fetch,
): Promise<{ bytes: Uint8Array; sourceUrl?: string }> {
  if (font.source.kind === "file")
    return {
      bytes: new Uint8Array(await readFile(resolve(cwd, font.source.path))),
    };
  if (font.source.kind === "url") {
    const result = await limitedFetch(
      font.source.url,
      config,
      "font/woff2,font/woff,font/ttf,font/otf,*/*;q=0.1",
      fetcher,
    );
    return { bytes: result.bytes, sourceUrl: result.url };
  }
  const css = await limitedFetch(font.source.url, config, "text/css", fetcher);
  const urls = fontUrlsFromCss(new TextDecoder().decode(css.bytes), css.url);
  if (urls.length === 0)
    throw new Error(`No @font-face source found in ${font.source.url}.`);
  // A config entry represents one face. Additional faces should use additional named entries.
  const result = await limitedFetch(
    urls[0]!,
    config,
    "font/woff2,font/woff,*/*;q=0.1",
    fetcher,
  );
  return { bytes: result.bytes, sourceUrl: result.url };
}

function signature(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.subarray(0, 4));
}

async function normalizeFont(
  input: Uint8Array,
): Promise<{ sfnt: Uint8Array; sourceFlavor: FontFaceMetadata["flavor"] }> {
  const magic = signature(input);
  if (magic === "wOF2")
    return {
      sfnt: new Uint8Array(await decompress(input)),
      sourceFlavor: "woff2",
    };
  if (magic === "wOFF") {
    const parsed = parseSfnt(input);
    return { sfnt: buildSfnt(parsed), sourceFlavor: "woff" };
  }
  const parsed = parseSfnt(input);
  return {
    sfnt: buildSfnt(parsed),
    sourceFlavor: parsed.flavor === 0x4f54544f ? "cff" : "truetype",
  };
}

function metadata(
  id: string,
  sfnt: Uint8Array,
  sourceFlavor: FontFaceMetadata["flavor"],
  sourceUrl?: string,
): FontFaceMetadata {
  const font = parseSfnt(sfnt);
  const result: FontFaceMetadata = {
    id,
    sha256: createHash("sha256").update(sfnt).digest("hex"),
    flavor: sourceFlavor,
    bytes: sfnt.length,
    codepoints: fontCodepoints(font),
    tables: [...font.tables.keys()].sort(),
    variable: font.tables.has("fvar"),
    color: ["COLR", "CBDT", "sbix", "SVG "].some((table) =>
      font.tables.has(table),
    ),
  };
  return sourceUrl ? { ...result, sourceUrl } : result;
}

export async function inspectFont(
  input: Uint8Array,
  id = "font",
): Promise<PreparedFont> {
  const normalized = await normalizeFont(input);
  return {
    id,
    sfnt: normalized.sfnt,
    metadata: metadata(id, normalized.sfnt, normalized.sourceFlavor),
  };
}

export async function prepareGlyphFonts(
  config: GlyphConfig,
  options: { cwd?: string; outputDir?: string; fetcher?: typeof fetch } = {},
): Promise<GlyphLockfile> {
  const cwd = options.cwd ?? process.cwd();
  const outputDir = resolve(cwd, options.outputDir ?? ".glyphscramble");
  const lock: GlyphLockfile = {
    version: 1,
    unicodeVersion: "17.0.0",
    generatedAt: new Date().toISOString(),
    fonts: {},
  };
  await mkdir(resolve(outputDir, "fonts"), { recursive: true });
  for (const [id, configFont] of Object.entries(config.fonts)) {
    await readFile(resolve(cwd, configFont.license.file));
    const source = await resolveSource(
      configFont,
      config,
      cwd,
      options.fetcher ?? fetch,
    );
    const normalized = await normalizeFont(source.bytes);
    const limit = config.maxNormalizedBytes ?? DEFAULT_NORMALIZED_BYTES;
    if (normalized.sfnt.length > limit && !configFont.allowLargeFont) {
      throw new Error(
        `Font ${id} is ${normalized.sfnt.length} bytes after normalization; limit is ${limit}. Set coverage or allowLargeFont.`,
      );
    }
    const face = metadata(
      id,
      normalized.sfnt,
      normalized.sourceFlavor,
      source.sourceUrl,
    );
    const coverage = configFont.coverage ?? summarizeCoverage(face.codepoints);
    lock.fonts[id] = {
      ...face,
      source: configFont.source,
      license: configFont.license,
      coverage,
    };
    await writeFile(resolve(outputDir, "fonts", `${id}.sfnt`), normalized.sfnt);
  }
  await writeFile(
    resolve(outputDir, "glyphscramble.lock.json"),
    JSON.stringify(lock, null, 2) + "\n",
  );
  return lock;
}

export async function loadPreparedFont(
  id: string,
  cwd = process.cwd(),
): Promise<PreparedFont> {
  const base = resolve(cwd, ".glyphscramble");
  const lock = JSON.parse(
    await readFile(resolve(base, "glyphscramble.lock.json"), "utf8"),
  ) as GlyphLockfile;
  const entry = lock.fonts[id];
  if (!entry)
    throw new Error(
      `Font ${id} is not present in glyphscramble.lock.json. Run glyphscramble prepare.`,
    );
  const sfnt = new Uint8Array(
    await readFile(resolve(base, "fonts", `${id}.sfnt`)),
  );
  const digest = createHash("sha256").update(sfnt).digest("hex");
  if (digest !== entry.sha256)
    throw new Error(`Prepared font ${id} does not match its lockfile.`);
  return { id, sfnt, metadata: entry };
}

export async function toWoff2(font: SfntFont): Promise<Uint8Array> {
  return new Uint8Array(await compress(buildSfnt(font)));
}

export function summarizeCoverage(codepoints: readonly number[]): string[] {
  if (codepoints.length === 0) return [];
  const ranges: string[] = [];
  let start = codepoints[0]!;
  let end = start;
  const add = () =>
    ranges.push(
      start === end
        ? `U+${start.toString(16).toUpperCase()}`
        : `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`,
    );
  for (const cp of codepoints.slice(1)) {
    if (cp === end + 1) end = cp;
    else {
      add();
      start = end = cp;
    }
  }
  add();
  return ranges;
}

export async function ensureLicenseDirectory(
  config: GlyphConfig,
  destination: string,
  cwd = process.cwd(),
): Promise<void> {
  for (const [id, font] of Object.entries(config.fonts)) {
    const target = resolve(destination, `${id}-${font.license.spdx}.txt`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(resolve(cwd, font.license.file)));
  }
}
