import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, parse as parsePath, resolve } from "node:path";
import { generate, parse, walk, type Declaration } from "css-tree";
import { compress, decompress } from "woff2-encoder";
import {
  codepointInCoverage,
  coverageContains,
  normalizeCoverage,
  parseCoverage,
} from "./coverage.js";
import { validateGlyphConfig } from "./config.js";
import { PACKAGE_VERSION } from "./generated/version.js";
import { assertCoverageWireBounds } from "./limits.js";
import { asGlyphFontError } from "./font-error.js";
import { extractFontMetadata } from "./font-metadata.js";
import {
  DEFAULT_FONT_PARSE_LIMITS,
  buildSfnt,
  fontCodepoints,
  parseSfnt,
  woff2DeclaredSize,
  type SfntFont,
} from "./sfnt.js";
import {
  fetchBounded,
  type FetchedResource,
  type HostResolver,
} from "./remote.js";
import type {
  FontConfig,
  FontFaceDescriptors,
  FontFaceMetadata,
  FontFaceSelector,
  GlyphConfig,
  GlyphLockfile,
  PreparedFontFamilyMetadata,
} from "./types.js";

const DEFAULT_NORMALIZED_BYTES = 2 * 1024 * 1024;
const GLYPH_USER_AGENT = `GlyphScramble/${PACKAGE_VERSION} (+https://github.com/brip-io/glyphscramble)`;
const GOOGLE_FONTS_USER_AGENT = `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36 GlyphScramble/${PACKAGE_VERSION}`;

export interface PreparedFont {
  /** Logical configured family id. */
  id: string;
  faceId: string;
  sfnt: Uint8Array;
  metadata: FontFaceMetadata;
}

export interface CssFontFace {
  family: string;
  weight: string;
  style: string;
  stretch: string;
  unicodeRange: readonly string[];
  sourceUrl: string;
}

interface ResolvedFace {
  id: string;
  bytes: Uint8Array;
  sourceUrl?: string;
  sourceDescriptors?: FontFaceDescriptors;
  descriptorOverrides?: Partial<Omit<FontFaceDescriptors, "unicodeRange">>;
  requestedCoverage?: readonly string[];
}

interface ResolvedFamily {
  faces: ResolvedFace[];
  sourceUrl?: string;
  sourceSha256?: string;
  requestProfile?: PreparedFontFamilyMetadata["requestProfile"];
}

interface NormalizedFont {
  sfnt: Uint8Array;
  container: FontFaceMetadata["container"];
  flavor: FontFaceMetadata["flavor"];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function cssString(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    return trimmed.slice(1, -1);
  return trimmed;
}

function canonicalWeight(value: string | number | undefined): string {
  if (value === undefined) return "400";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "normal") return "400";
  if (normalized === "bold") return "700";
  return normalized.replaceAll(/\s+/g, " ");
}

function supportedFontUrl(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return (
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".ttf") ||
    pathname.endsWith(".otf") ||
    !pathname.includes(".")
  );
}

function urlPreference(url: string): number {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".woff2")) return 0;
  if (pathname.endsWith(".woff")) return 1;
  if (pathname.endsWith(".otf")) return 2;
  if (pathname.endsWith(".ttf")) return 3;
  return 4;
}

/** Parse only URLs belonging to valid @font-face declarations. */
export function parseCssFontFaces(css: string, base: string): CssFontFace[] {
  const parseErrors: string[] = [];
  const ast = parse(css, {
    context: "stylesheet",
    positions: true,
    onParseError(error) {
      parseErrors.push(error.message);
    },
  });
  walk(ast, (node) => {
    if (node.type === "Raw") parseErrors.push("unparsed CSS token");
  });
  if (parseErrors.length)
    throw new Error(`Invalid font CSS: ${parseErrors.join("; ")}`);

  const faces: CssFontFace[] = [];
  walk(ast, {
    visit: "Atrule",
    enter(node) {
      if (node.name.toLowerCase() !== "font-face" || !node.block) return;
      const declarations = node.block.children
        .toArray()
        .filter((item): item is Declaration => item.type === "Declaration");
      const values = new Map(
        declarations.map((item) => [
          item.property.toLowerCase(),
          generate(item.value).trim(),
        ]),
      );
      const src = declarations.find(
        (item) => item.property.toLowerCase() === "src",
      );
      if (!src) return;
      const urls: string[] = [];
      walk(src.value, (child) => {
        if (child.type !== "Url") return;
        const resolved = new URL(child.value, base);
        if (resolved.protocol === "https:" && supportedFontUrl(resolved.href))
          urls.push(resolved.href);
      });
      const sourceUrl = [...new Set(urls)].sort(
        (left, right) => urlPreference(left) - urlPreference(right),
      )[0];
      if (!sourceUrl) return;
      const unicodeRange = values.has("unicode-range")
        ? normalizeCoverage(values.get("unicode-range")!.split(","))
        : [];
      faces.push({
        family: cssString(values.get("font-family") ?? "font"),
        weight: canonicalWeight(values.get("font-weight")),
        style: (values.get("font-style") ?? "normal").toLowerCase(),
        stretch: (values.get("font-stretch") ?? "normal").toLowerCase(),
        unicodeRange,
        sourceUrl,
      });
    },
  });
  return faces;
}

function selectorMatches(
  candidate: CssFontFace,
  selector: FontFaceSelector,
): boolean {
  if (selector.family && candidate.family !== selector.family) return false;
  if (
    selector.weight !== undefined &&
    candidate.weight !== canonicalWeight(selector.weight)
  )
    return false;
  if (selector.style && candidate.style !== selector.style.toLowerCase())
    return false;
  if (selector.stretch && candidate.stretch !== selector.stretch.toLowerCase())
    return false;
  if (selector.coverage && candidate.unicodeRange.length) {
    if (
      !coverageContains(
        parseCoverage(candidate.unicodeRange),
        parseCoverage(selector.coverage),
      )
    )
      return false;
  }
  return true;
}

function candidateDescription(candidate: CssFontFace): string {
  const range = candidate.unicodeRange.length
    ? `, range ${candidate.unicodeRange.join(",")}`
    : "";
  return `${candidate.family} ${candidate.weight} ${candidate.style} ${candidate.stretch}${range}`;
}

function selectorDescriptorOverrides(
  selector: FontFaceSelector,
): Partial<Omit<FontFaceDescriptors, "unicodeRange">> {
  return {
    ...(selector.family ? { family: selector.family } : {}),
    ...(selector.weight !== undefined
      ? { weight: canonicalWeight(selector.weight) }
      : {}),
    ...(selector.style ? { style: selector.style.toLowerCase() } : {}),
    ...(selector.stretch ? { stretch: selector.stretch.toLowerCase() } : {}),
  };
}

async function resolveFamily(
  id: string,
  font: FontConfig,
  config: GlyphConfig,
  cwd: string,
  fetcher: typeof fetch,
  resolver?: HostResolver,
): Promise<ResolvedFamily> {
  if (font.source.kind === "file") {
    const faces = Object.entries(font.faces ?? { default: {} });
    if (faces.length !== 1)
      throw new Error(`Local font ${id} accepts exactly one face selector.`);
    return {
      faces: [
        {
          id: faces[0]![0],
          bytes: new Uint8Array(await readFile(resolve(cwd, font.source.path))),
          descriptorOverrides: selectorDescriptorOverrides(faces[0]![1]),
          ...((faces[0]![1].coverage ?? font.coverage)
            ? { requestedCoverage: faces[0]![1].coverage ?? font.coverage }
            : {}),
        },
      ],
    };
  }
  if (font.source.kind === "url") {
    const faces = Object.entries(font.faces ?? { default: {} });
    if (faces.length !== 1)
      throw new Error(`Direct font ${id} accepts exactly one face selector.`);
    const result = await fetchBounded(font.source.url, {
      accept: "font/woff2,font/woff,font/ttf,font/otf,*/*;q=0.1",
      config,
      fetcher,
      kind: "font",
      ...(resolver ? { resolver } : {}),
      userAgent: GLYPH_USER_AGENT,
    });
    return {
      sourceUrl: result.url,
      sourceSha256: sha256(result.bytes),
      faces: [
        {
          id: faces[0]![0],
          bytes: result.bytes,
          sourceUrl: result.url,
          descriptorOverrides: selectorDescriptorOverrides(faces[0]![1]),
          ...((faces[0]![1].coverage ?? font.coverage)
            ? { requestedCoverage: faces[0]![1].coverage ?? font.coverage }
            : {}),
        },
      ],
    };
  }

  const css = await fetchBounded(font.source.url, {
    accept: "text/css",
    config,
    fetcher,
    kind: "css",
    ...(resolver ? { resolver } : {}),
    userAgent: GOOGLE_FONTS_USER_AGENT,
  });
  const candidates = parseCssFontFaces(
    new TextDecoder().decode(css.bytes),
    css.url,
  );
  if (!candidates.length)
    throw new Error(`No @font-face source found in ${font.source.url}.`);

  const selections = Object.entries(font.faces ?? {});
  if (!selections.length && candidates.length > 1)
    throw new Error(
      `Font ${id} CSS returned multiple @font-face candidates. Configure fonts.${id}.faces explicitly. Candidates: ${candidates.map(candidateDescription).join("; ")}`,
    );
  const selected = selections.length
    ? selections.map(([faceId, selector]) => {
        const matches = candidates.filter((candidate) =>
          selectorMatches(candidate, selector),
        );
        if (matches.length !== 1)
          throw new Error(
            `Face ${id}.${faceId} matched ${matches.length} @font-face candidates; refine family, weight, style, stretch, or coverage. Candidates: ${candidates.map(candidateDescription).join("; ")}`,
          );
        return { id: faceId, selector, candidate: matches[0]! };
      })
    : [
        {
          id: "default",
          selector: {} as FontFaceSelector,
          candidate: candidates[0]!,
        },
      ];

  const fetched = new Map<string, Promise<FetchedResource>>();
  const faces = await Promise.all(
    selected.map(async ({ id: faceId, selector, candidate }) => {
      let pending = fetched.get(candidate.sourceUrl);
      if (!pending) {
        pending = fetchBounded(candidate.sourceUrl, {
          accept: "font/woff2,font/woff,font/ttf,font/otf,*/*;q=0.1",
          config,
          fetcher,
          kind: "font",
          ...(resolver ? { resolver } : {}),
          userAgent: GLYPH_USER_AGENT,
        });
        fetched.set(candidate.sourceUrl, pending);
      }
      const result = await pending;
      return {
        id: faceId,
        bytes: result.bytes,
        sourceUrl: result.url,
        sourceDescriptors: {
          family: candidate.family,
          weight: candidate.weight,
          style: candidate.style,
          stretch: candidate.stretch,
          unicodeRange: candidate.unicodeRange,
        },
        descriptorOverrides: selectorDescriptorOverrides(selector),
        requestedCoverage:
          selector.coverage ?? font.coverage ?? candidate.unicodeRange,
      } satisfies ResolvedFace;
    }),
  );
  return {
    sourceUrl: css.url,
    sourceSha256: sha256(css.bytes),
    requestProfile: "google-fonts-woff2-v1",
    faces,
  };
}

function signature(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.subarray(0, 4));
}

async function normalizeFont(
  input: Uint8Array,
  maxOutputBytes = DEFAULT_FONT_PARSE_LIMITS.maxOutputBytes,
): Promise<NormalizedFont> {
  const magic = signature(input);
  let sfnt: Uint8Array;
  let container: NormalizedFont["container"];
  if (magic === "wOF2") {
    woff2DeclaredSize(input, { maxOutputBytes });
    sfnt = new Uint8Array(await decompress(input));
    if (sfnt.length > maxOutputBytes)
      throw new Error(`WOFF2 output exceeds ${maxOutputBytes} bytes.`);
    container = "woff2";
  } else if (magic === "wOFF") {
    sfnt = buildSfnt(parseSfnt(input, { maxOutputBytes }));
    container = "woff";
  } else {
    sfnt = buildSfnt(parseSfnt(input, { maxOutputBytes }));
    container = "sfnt";
  }
  const parsed = parseSfnt(sfnt, {
    maxInputBytes: maxOutputBytes,
    maxOutputBytes,
  });
  return {
    sfnt,
    container,
    flavor: parsed.flavor === 0x4f54544f ? "cff" : "truetype",
  };
}

function metadata(
  familyId: string,
  faceId: string,
  normalized: NormalizedFont,
  source: Uint8Array,
  sourceUrl?: string,
  sourceDescriptors?: ResolvedFace["sourceDescriptors"],
  descriptorOverrides?: ResolvedFace["descriptorOverrides"],
  requestedCoverage?: readonly string[],
): FontFaceMetadata {
  const font = parseSfnt(normalized.sfnt);
  const extracted = extractFontMetadata(font, familyId);
  const allCodepoints = fontCodepoints(font);
  const requested = requestedCoverage?.length
    ? parseCoverage(requestedCoverage)
    : undefined;
  const codepoints = requested
    ? allCodepoints.filter((codepoint) =>
        codepointInCoverage(codepoint, requested),
      )
    : allCodepoints;
  if (!codepoints.length)
    throw new Error(
      `Font ${familyId}.${faceId} coverage does not contain any source codepoints.`,
    );
  const coverage = summarizeCoverage(codepoints);
  assertCoverageWireBounds(coverage, `Font ${familyId}.${faceId} coverage`);
  const lockedSourceDescriptors = {
    ...extracted.descriptors,
    ...(sourceDescriptors ?? {}),
    unicodeRange: sourceDescriptors?.unicodeRange.length
      ? sourceDescriptors.unicodeRange
      : summarizeCoverage(allCodepoints),
  };
  const descriptors = {
    ...lockedSourceDescriptors,
    ...(descriptorOverrides ?? {}),
    unicodeRange: coverage,
  };
  const normalizedSha256 = sha256(normalized.sfnt);
  const identity = createHash("sha256")
    .update(normalizedSha256)
    .update("\0")
    .update(JSON.stringify(descriptors))
    .update("\0")
    .update(JSON.stringify(coverage))
    .digest("hex");
  return {
    id: faceId,
    familyId,
    identity,
    ...(sourceUrl ? { sourceUrl } : {}),
    sourceSha256: sha256(source),
    sha256: normalizedSha256,
    container: normalized.container,
    flavor: normalized.flavor,
    bytes: normalized.sfnt.length,
    codepoints,
    coverage,
    tables: [...font.tables.keys()].sort(),
    variable: font.tables.has("fvar"),
    color: ["COLR", "CBDT", "sbix", "SVG "].some((table) =>
      font.tables.has(table),
    ),
    sourceDescriptors: lockedSourceDescriptors,
    descriptors,
    names: extracted.names,
    axes: extracted.axes,
    features: extracted.features,
  };
}

export async function inspectFont(
  input: Uint8Array,
  id = "font",
): Promise<PreparedFont> {
  try {
    const normalized = await normalizeFont(input);
    return {
      id,
      faceId: "default",
      sfnt: normalized.sfnt,
      metadata: metadata(id, "default", normalized, input),
    };
  } catch (error) {
    throw asGlyphFontError(`${id}.default`, error);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertSafeOutput(outputDir: string): void {
  if (parsePath(outputDir).root === outputDir)
    throw new Error("Refusing to prepare fonts into a filesystem root.");
}

async function publishDirectory(
  staging: string,
  outputDir: string,
): Promise<void> {
  const backup = `${outputDir}.backup-${randomUUID()}`;
  const hadOutput = await exists(outputDir);
  try {
    if (hadOutput) await rename(outputDir, backup);
    await rename(staging, outputDir);
    if (hadOutput) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (!(await exists(outputDir)) && (await exists(backup)))
      await rename(backup, outputDir);
    throw error;
  } finally {
    if (await exists(staging))
      await rm(staging, { recursive: true, force: true });
  }
}

export async function prepareGlyphFonts(
  config: GlyphConfig,
  options: {
    cwd?: string;
    outputDir?: string;
    fetcher?: typeof fetch;
    resolver?: HostResolver;
    generatedAt?: string;
  } = {},
): Promise<GlyphLockfile> {
  validateGlyphConfig(config);
  const cwd = options.cwd ?? process.cwd();
  const outputDir = resolve(cwd, options.outputDir ?? ".glyphscramble");
  assertSafeOutput(outputDir);
  await mkdir(dirname(outputDir), { recursive: true });
  const staging = await mkdtemp(`${outputDir}.staging-`);
  const lock: GlyphLockfile = {
    version: 2,
    toolVersion: PACKAGE_VERSION,
    unicodeVersion: "17.0.0",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    fonts: {},
  };

  try {
    await mkdir(resolve(staging, "fonts"), { recursive: true });
    await mkdir(resolve(staging, "licenses"), { recursive: true });
    for (const [familyId, configFont] of Object.entries(config.fonts)) {
      const notice = new Uint8Array(
        await readFile(
          /* turbopackIgnore: true */ resolve(cwd, configFont.license.file),
        ),
      );
      const noticeFile = `licenses/${familyId}.LICENSE.txt`;
      await writeFile(resolve(staging, noticeFile), notice);
      const resolvedFamily = await resolveFamily(
        familyId,
        configFont,
        config,
        cwd,
        options.fetcher ?? fetch,
        options.resolver,
      );
      const family: PreparedFontFamilyMetadata = {
        id: familyId,
        source: configFont.source,
        ...(resolvedFamily.sourceUrl
          ? { sourceUrl: resolvedFamily.sourceUrl }
          : {}),
        ...(resolvedFamily.sourceSha256
          ? { sourceSha256: resolvedFamily.sourceSha256 }
          : {}),
        ...(resolvedFamily.requestProfile
          ? { requestProfile: resolvedFamily.requestProfile }
          : {}),
        defaultFace:
          configFont.defaultFace ?? resolvedFamily.faces[0]?.id ?? "default",
        license: {
          ...configFont.license,
          noticeFile,
          noticeSha256: sha256(notice),
        },
        faces: {},
      };
      await mkdir(resolve(staging, "fonts", familyId), { recursive: true });
      for (const resolvedFace of resolvedFamily.faces) {
        try {
          const hardLimit = Math.max(
            DEFAULT_FONT_PARSE_LIMITS.maxOutputBytes,
            config.maxNormalizedBytes ?? 0,
          );
          const normalized = await normalizeFont(resolvedFace.bytes, hardLimit);
          const limit = config.maxNormalizedBytes ?? DEFAULT_NORMALIZED_BYTES;
          if (
            normalized.sfnt.length > limit &&
            !resolvedFace.requestedCoverage?.length &&
            !configFont.allowLargeFont
          )
            throw new Error(
              `Font ${familyId}.${resolvedFace.id} is ${normalized.sfnt.length} bytes after normalization; limit is ${limit}. Set effective coverage or allowLargeFont.`,
            );
          const face = metadata(
            familyId,
            resolvedFace.id,
            normalized,
            resolvedFace.bytes,
            resolvedFace.sourceUrl,
            resolvedFace.sourceDescriptors,
            resolvedFace.descriptorOverrides,
            resolvedFace.requestedCoverage,
          );
          family.faces[resolvedFace.id] = face;
          await writeFile(
            resolve(staging, "fonts", familyId, `${resolvedFace.id}.sfnt`),
            normalized.sfnt,
          );
        } catch (error) {
          throw asGlyphFontError(`${familyId}.${resolvedFace.id}`, error);
        }
      }
      if (!family.faces[family.defaultFace])
        throw new Error(
          `Default face ${familyId}.${family.defaultFace} was not prepared.`,
        );
      lock.fonts[familyId] = family;
    }
    await writeFile(
      resolve(staging, "glyphscramble.lock.json"),
      `${JSON.stringify(lock, null, 2)}\n`,
    );
    await publishDirectory(staging, outputDir);
    return lock;
  } catch (error) {
    if (await exists(staging))
      await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function readLock(base: string): Promise<GlyphLockfile> {
  const parsed = JSON.parse(
    await readFile(resolve(base, "glyphscramble.lock.json"), "utf8"),
  ) as { version?: number };
  if (parsed.version !== 2)
    throw new Error(
      `Unsupported GlyphScramble lockfile version ${String(parsed.version)}. Run glyphscramble prepare to create version 2.`,
    );
  return parsed as GlyphLockfile;
}

async function readPreparedFace(
  base: string,
  id: string,
  faceId: string,
  entry: FontFaceMetadata,
): Promise<PreparedFont> {
  const sfnt = new Uint8Array(
    await readFile(resolve(base, "fonts", id, `${faceId}.sfnt`)),
  );
  if (sha256(sfnt) !== entry.sha256)
    throw new Error(
      `Prepared font ${id}.${faceId} does not match its lockfile.`,
    );
  return { id, faceId, sfnt, metadata: entry };
}

export async function loadPreparedFont(
  id: string,
  cwd = process.cwd(),
  faceId?: string,
): Promise<PreparedFont> {
  const base = resolve(cwd, ".glyphscramble");
  const lock = await readLock(base);
  const family = lock.fonts[id];
  if (!family)
    throw new Error(
      `Font ${id} is not present in glyphscramble.lock.json. Run glyphscramble prepare.`,
    );
  const selectedFace = faceId ?? family.defaultFace;
  const entry = family.faces[selectedFace];
  if (!entry)
    throw new Error(
      `Face ${id}.${selectedFace} is not present in glyphscramble.lock.json.`,
    );
  return readPreparedFace(base, id, selectedFace, entry);
}

export async function loadPreparedFonts(
  id: string,
  cwd = process.cwd(),
): Promise<PreparedFont[]> {
  const base = resolve(cwd, ".glyphscramble");
  const lock = await readLock(base);
  const family = lock.fonts[id];
  if (!family)
    throw new Error(
      `Font ${id} is not present in glyphscramble.lock.json. Run glyphscramble prepare.`,
    );
  return Promise.all(
    Object.entries(family.faces).map(([faceId, entry]) =>
      readPreparedFace(base, id, faceId, entry),
    ),
  );
}

/** Load every configured family through one lockfile read and one read per face. */
export async function loadPreparedFontFamilies(
  ids: readonly string[],
  cwd = process.cwd(),
): Promise<ReadonlyMap<string, readonly PreparedFont[]>> {
  const base = resolve(cwd, ".glyphscramble");
  const lock = await readLock(base);
  const families = await Promise.all(
    ids.map(async (id) => {
      const family = lock.fonts[id];
      if (!family)
        throw new Error(
          `Font ${id} is not present in glyphscramble.lock.json. Run glyphscramble prepare.`,
        );
      const faces = await Promise.all(
        Object.entries(family.faces).map(([faceId, entry]) =>
          readPreparedFace(base, id, faceId, entry),
        ),
      );
      return [id, faces] as const;
    }),
  );
  return new Map(families);
}

export async function toWoff2(font: SfntFont): Promise<Uint8Array> {
  return new Uint8Array(await compress(buildSfnt(font)));
}

export function summarizeCoverage(codepoints: readonly number[]): string[] {
  if (codepoints.length === 0) return [];
  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0]!;
  let end = start;
  const add = () =>
    ranges.push(
      start === end
        ? `U+${start.toString(16).toUpperCase()}`
        : `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`,
    );
  for (const cp of sorted.slice(1)) {
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
  validateGlyphConfig(config);
  for (const [id, font] of Object.entries(config.fonts)) {
    const target = resolve(destination, `${id}.LICENSE.txt`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(resolve(cwd, font.license.file)));
  }
}
