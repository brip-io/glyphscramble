import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checksum } from "../src/binary.js";
import { buildCmap } from "../src/cmap.js";
import { defineGlyphConfig } from "../src/config.js";
import { GlyphFontError } from "../src/font-error.js";
import {
  inspectFont,
  loadPreparedFont,
  parseCssFontFaces,
  prepareGlyphFonts,
  toWoff2,
} from "../src/font-pipeline.js";
import { buildSfnt, parseSfnt } from "../src/sfnt.js";
import type { GlyphConfig } from "../src/types.js";
import { syntheticFont } from "./fixture.js";
import { PACKAGE_VERSION } from "../src/generated/version.js";

function woffFont(input: Uint8Array): Uint8Array {
  const parsed = parseSfnt(input);
  const tables = [...parsed.tables].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const align4 = (value: number) => (value + 3) & ~3;
  const directoryBytes = 44 + tables.length * 20;
  const totalBytes = tables.reduce(
    (total, [, bytes]) => total + align4(bytes.length),
    directoryBytes,
  );
  const output = new Uint8Array(totalBytes);
  const view = new DataView(output.buffer);
  const writeTag = (offset: number, value: string) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  writeTag(0, "wOFF");
  view.setUint32(4, parsed.flavor);
  view.setUint32(8, totalBytes);
  view.setUint16(12, tables.length);
  view.setUint32(16, input.length);
  let offset = directoryBytes;
  tables.forEach(([name, bytes], index) => {
    const entry = 44 + index * 20;
    writeTag(entry, name);
    view.setUint32(entry + 4, offset);
    view.setUint32(entry + 8, bytes.length);
    view.setUint32(entry + 12, bytes.length);
    const checksumBytes = bytes.slice();
    if (name === "head")
      new DataView(
        checksumBytes.buffer,
        checksumBytes.byteOffset,
        checksumBytes.byteLength,
      ).setUint32(8, 0);
    view.setUint32(entry + 16, checksum(checksumBytes));
    output.set(bytes, offset);
    offset += align4(bytes.length);
  });
  return output;
}

async function localFixture(): Promise<{
  cwd: string;
  config: GlyphConfig;
}> {
  const cwd = await mkdtemp(join(tmpdir(), "glyph-font-pipeline-"));
  await mkdir(join(cwd, "fonts"));
  await mkdir(join(cwd, "licenses"));
  await writeFile(join(cwd, "fonts/body.ttf"), syntheticFont());
  await writeFile(join(cwd, "licenses/OFL.txt"), "fixture license\n");
  const config = defineGlyphConfig({
    fonts: {
      body: {
        source: { kind: "file", path: "./fonts/body.ttf" },
        license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
        coverage: ["U+0041-005A"],
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
    maxNormalizedBytes: 1,
  });
  return { cwd, config };
}

function metadataFont(): Uint8Array {
  const parsed = parseSfnt(syntheticFont());
  const os2 = new Uint8Array(64);
  const os2View = new DataView(os2.buffer);
  os2View.setUint16(0, 4);
  os2View.setUint16(4, 700);
  os2View.setUint16(6, 3);
  os2View.setUint16(62, 1);

  const encodeUtf16 = (value: string): Uint8Array => {
    const bytes = new Uint8Array(value.length * 2);
    const view = new DataView(bytes.buffer);
    [...value].forEach((character, index) =>
      view.setUint16(index * 2, character.charCodeAt(0)),
    );
    return bytes;
  };
  const names = [
    [1, "Fixture Sans"],
    [2, "Bold Italic"],
    [6, "FixtureSans-BoldItalic"],
  ] as const;
  const encoded = names.map(([, value]) => encodeUtf16(value));
  const name = new Uint8Array(
    6 + names.length * 12 + encoded.reduce((sum, item) => sum + item.length, 0),
  );
  const nameView = new DataView(name.buffer);
  nameView.setUint16(2, names.length);
  nameView.setUint16(4, 6 + names.length * 12);
  let stringOffset = 0;
  names.forEach(([nameId], index) => {
    const base = 6 + index * 12;
    nameView.setUint16(base, 3);
    nameView.setUint16(base + 2, 1);
    nameView.setUint16(base + 4, 0x0409);
    nameView.setUint16(base + 6, nameId);
    nameView.setUint16(base + 8, encoded[index]!.length);
    nameView.setUint16(base + 10, stringOffset);
    name.set(encoded[index]!, 6 + names.length * 12 + stringOffset);
    stringOffset += encoded[index]!.length;
  });

  const fvar = new Uint8Array(36);
  const fvarView = new DataView(fvar.buffer);
  fvarView.setUint16(0, 1);
  fvarView.setUint16(4, 16);
  fvarView.setUint16(6, 2);
  fvarView.setUint16(8, 1);
  fvarView.setUint16(10, 20);
  for (const [index, byte] of [..."wght"].entries())
    fvarView.setUint8(16 + index, byte.charCodeAt(0));
  fvarView.setInt32(20, 100 * 65536);
  fvarView.setInt32(24, 400 * 65536);
  fvarView.setInt32(28, 900 * 65536);
  fvarView.setUint16(34, 256);

  const gsub = new Uint8Array(22);
  const gsubView = new DataView(gsub.buffer);
  gsubView.setUint32(0, 0x00010000);
  gsubView.setUint16(6, 10);
  gsubView.setUint16(10, 1);
  for (const [index, byte] of [..."liga"].entries())
    gsubView.setUint8(12 + index, byte.charCodeAt(0));
  gsubView.setUint16(16, 8);

  return buildSfnt({
    ...parsed,
    tables: new Map([
      ...parsed.tables,
      ["OS/2", os2],
      ["name", name],
      ["fvar", fvar],
      ["GSUB", gsub],
    ]),
  });
}

describe("font-face preparation", () => {
  it("reports corrupt fonts with a stable code, target, and repair path", async () => {
    let failure: unknown;
    try {
      await inspectFont(new Uint8Array([0, 1, 2, 3]), "body");
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(GlyphFontError);
    expect(failure).toMatchObject({
      code: "GLYPH_FONT_CONTAINER_INVALID",
      target: "body.default",
    });
    expect((failure as Error).message).toMatch(
      /body\.default.*OTS\/fonttools.*FONT-SOURCES\.md#repairing-rejected-fonts/i,
    );
  });

  it("rejects prepared coverage that exceeds the browser wire boundary", async () => {
    const { cwd, config } = await localFixture();
    const parsed = parseSfnt(syntheticFont());
    const mapping = new Map<number, number>();
    for (let index = 0; index < 1_025; index++)
      mapping.set(0x1000 + index * 2, 1);
    const tables = new Map(parsed.tables);
    tables.set("cmap", buildCmap(mapping));
    await writeFile(
      join(cwd, "fonts/body.ttf"),
      buildSfnt({ ...parsed, tables }),
    );
    const unboundedCoverage: GlyphConfig = {
      ...config,
      maxNormalizedBytes: 4 * 1024 * 1024,
      fonts: {
        body: {
          ...config.fonts.body!,
          coverage: undefined,
        },
      },
    };
    await expect(
      prepareGlyphFonts(unboundedCoverage, { cwd }),
    ).rejects.toMatchObject({
      code: "GLYPH_FONT_COVERAGE_INVALID",
      target: "body.default",
    });
  });
  it("writes lockfile v2 transactionally with effective coverage and notices", async () => {
    const { cwd, config } = await localFixture();
    const lock = await prepareGlyphFonts(config, {
      cwd,
      generatedAt: "2026-09-02T00:00:00.000Z",
    });
    expect(lock.version).toBe(2);
    expect(lock.toolVersion).toBe(PACKAGE_VERSION);
    expect(lock.fonts.body?.defaultFace).toBe("default");
    const face = lock.fonts.body?.faces.default;
    expect(face?.codepoints).toEqual(
      Array.from({ length: 26 }, (_, index) => 0x41 + index),
    );
    expect(face?.coverage).toEqual(["U+41-5A"]);
    expect(face?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(face?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(face?.identity).toMatch(/^[a-f0-9]{64}$/);
    expect(lock.fonts.body?.license.noticeFile).toBe(
      "licenses/body.LICENSE.txt",
    );
    const notice = await readFile(
      join(cwd, ".glyphscramble/licenses/body.LICENSE.txt"),
    );
    expect(createHash("sha256").update(notice).digest("hex")).toBe(
      lock.fonts.body?.license.noticeSha256,
    );

    const prepared = await loadPreparedFont("body", cwd);
    expect(prepared.faceId).toBe("default");
    expect(prepared.metadata.codepoints).toEqual(face?.codepoints);

    const before = await readFile(
      join(cwd, ".glyphscramble/glyphscramble.lock.json"),
      "utf8",
    );
    const invalid = structuredClone(config) as GlyphConfig;
    (invalid.fonts.body as { coverage?: readonly string[] }).coverage = [
      "U+0100",
    ];
    await expect(prepareGlyphFonts(invalid, { cwd })).rejects.toThrow(
      /coverage/i,
    );
    expect(
      await readFile(
        join(cwd, ".glyphscramble/glyphscramble.lock.json"),
        "utf8",
      ),
    ).toBe(before);

    const repeated = await prepareGlyphFonts(config, {
      cwd,
      outputDir: ".glyphscramble-repeat",
      generatedAt: "2026-09-02T00:00:00.000Z",
    });
    expect(repeated).toEqual(lock);
  });

  it("parses font-face rules and selects multiple explicit CSS faces", async () => {
    const css = `
      body { background: url(https://example.test/not-a-font.png); }
      @font-face { font-family: "Inter"; font-style: normal; font-weight: 400; font-stretch: normal; src: url(https://fonts.gstatic.test/inter-400.woff2) format("woff2"); unicode-range: U+0000-00FF; }
      @font-face { font-family: "Inter"; font-style: normal; font-weight: 700; src: url(https://fonts.gstatic.test/inter-700.woff2) format("woff2"); unicode-range: U+0000-00FF; }
      @font-face { font-family: "Inter"; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.test/inter-cyrillic.woff2) format("woff2"); unicode-range: U+0400-04FF; }
    `;
    const candidates = parseCssFontFaces(
      css,
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700",
    );
    expect(candidates).toHaveLength(3);
    expect(candidates.map((item) => item.sourceUrl)).not.toContain(
      "https://example.test/not-a-font.png",
    );

    const cwd = await mkdtemp(join(tmpdir(), "glyph-css-faces-"));
    await mkdir(join(cwd, "licenses"));
    await writeFile(join(cwd, "licenses/OFL.txt"), "OFL fixture\n");
    const config = defineGlyphConfig({
      fonts: {
        body: {
          source: {
            kind: "google-css",
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700",
          },
          license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
          faces: {
            regular: {
              family: "Inter",
              weight: 400,
              coverage: ["U+0041-005A"],
            },
            bold: { family: "Inter", weight: 700, coverage: ["U+0041-005A"] },
          },
          defaultFace: "regular",
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
    });
    const requests: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(url);
      if (url.startsWith("https://fonts.googleapis.com/"))
        return new Response(css, { headers: { "content-type": "text/css" } });
      return new Response(syntheticFont(), {
        headers: { "content-type": "font/woff2" },
      });
    }) as typeof fetch;
    const lock = await prepareGlyphFonts(config, { cwd, fetcher });
    expect(Object.keys(lock.fonts.body?.faces ?? {})).toEqual([
      "regular",
      "bold",
    ]);
    expect(lock.fonts.body?.faces.regular?.descriptors.weight).toBe("400");
    expect(lock.fonts.body?.faces.bold?.descriptors.weight).toBe("700");
    expect(lock.fonts.body?.requestProfile).toBe("google-fonts-woff2-v1");
    expect(
      lock.fonts.body?.faces.regular?.sourceDescriptors.unicodeRange,
    ).toEqual(["U+0-FF"]);
    expect(requests).toContain("https://fonts.gstatic.test/inter-400.woff2");
    expect(requests).toContain("https://fonts.gstatic.test/inter-700.woff2");
    expect(requests).not.toContain(
      "https://fonts.gstatic.test/inter-cyrillic.woff2",
    );
  });

  it("rejects ambiguous CSS and invalid SPDX expressions", async () => {
    expect(() =>
      defineGlyphConfig({
        fonts: {
          body: {
            source: { kind: "file", path: "body.ttf" },
            license: { spdx: "definitely not SPDX", file: "LICENSE" },
          },
        },
        rotation: {
          scope: "response",
          secretEnv: "GLYPHSCRAMBLE_SECRET",
          tokenTtlSeconds: 60,
        },
        routePrefix: "/_glyphscramble",
        unsupported: "error",
        accessibilityRiskAcknowledged: true,
      }),
    ).toThrow(/SPDX/);

    const css = `
      @font-face { font-family: Inter; font-weight: 400; src: url(https://fonts.gstatic.test/one.woff2); }
      @font-face { font-family: Inter; font-weight: 700; src: url(https://fonts.gstatic.test/two.woff2); }
    `;
    const cwd = await mkdtemp(join(tmpdir(), "glyph-ambiguous-css-"));
    await mkdir(join(cwd, "licenses"));
    await writeFile(join(cwd, "licenses/OFL.txt"), "OFL fixture\n");
    const config = defineGlyphConfig({
      fonts: {
        body: {
          source: {
            kind: "google-css",
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700",
          },
          license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
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
    });
    const fetcher = (async () =>
      new Response(css, {
        headers: { "content-type": "text/css" },
      })) as typeof fetch;
    await expect(prepareGlyphFonts(config, { cwd, fetcher })).rejects.toThrow(
      /multiple @font-face candidates/i,
    );
  });

  it("inspects names, descriptors, axes, and layout feature tags", async () => {
    const inspected = await inspectFont(metadataFont(), "fixture");
    expect(inspected.metadata.names).toEqual({
      family: "Fixture Sans",
      subfamily: "Bold Italic",
      postscript: "FixtureSans-BoldItalic",
    });
    expect(inspected.metadata.descriptors).toMatchObject({
      family: "Fixture Sans",
      weight: "700",
      style: "italic",
      stretch: "condensed",
    });
    expect(inspected.metadata.axes).toEqual([
      { tag: "wght", min: 100, default: 400, max: 900 },
    ]);
    expect(inspected.metadata.features).toContain("liga");
  });

  it("normalizes TTF, OTF, WOFF, and WOFF2 containers", async () => {
    const ttf = syntheticFont();
    const ttfInspection = await inspectFont(ttf, "ttf");
    expect(ttfInspection.metadata).toMatchObject({
      container: "sfnt",
      flavor: "truetype",
    });

    const parsed = parseSfnt(ttf);
    const otf = buildSfnt({ ...parsed, flavor: 0x4f54544f });
    const otfInspection = await inspectFont(otf, "otf");
    expect(otfInspection.metadata).toMatchObject({
      container: "sfnt",
      flavor: "cff",
    });

    const woffInspection = await inspectFont(woffFont(ttf), "woff");
    expect(woffInspection.metadata.container).toBe("woff");
    const woff2Inspection = await inspectFont(await toWoff2(parsed), "woff2");
    expect(woff2Inspection.metadata.container).toBe("woff2");
    expect(woff2Inspection.metadata.codepoints).toEqual(
      ttfInspection.metadata.codepoints,
    );
    expect(woff2Inspection.metadata.tables).toEqual(
      ttfInspection.metadata.tables,
    );
  });

  it("locks the final redirected URL and rejects lockfile v1", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "glyph-remote-font-"));
    await mkdir(join(cwd, "licenses"));
    await writeFile(join(cwd, "licenses/OFL.txt"), "OFL fixture\n");
    const config = defineGlyphConfig({
      fonts: {
        body: {
          source: { kind: "url", url: "https://example.test/font" },
          license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
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
    });
    const fetcher = (async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://example.test/font")
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.test/body.ttf" },
        });
      return new Response(syntheticFont(), {
        headers: { "content-type": "font/ttf" },
      });
    }) as typeof fetch;
    const lock = await prepareGlyphFonts(config, { cwd, fetcher });
    expect(lock.fonts.body?.sourceUrl).toBe(
      "https://cdn.example.test/body.ttf",
    );
    expect(lock.fonts.body?.faces.default?.sourceUrl).toBe(
      "https://cdn.example.test/body.ttf",
    );

    await writeFile(
      join(cwd, ".glyphscramble/glyphscramble.lock.json"),
      '{"version":1,"fonts":{}}\n',
    );
    await expect(loadPreparedFont("body", cwd)).rejects.toThrow(
      /lockfile version 1.*prepare/i,
    );
  });
});
