import { createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parse, serialize } from "parse5";
import { loadPreparedFont, toWoff2 } from "./font-pipeline.js";
import { parseSfnt, remapCmap } from "./sfnt.js";
import {
  StaticBuildPlanner,
  type StaticBuildPlan,
  type StaticBuildPlannerOptions,
  type StaticPlannedFile,
} from "./static-plan.js";
import { createPermutation, encodeText, type Permutation } from "./unicode.js";
import type { FontFaceDescriptors, GlyphConfig } from "./types.js";

interface HtmlAttribute {
  name: string;
  value: string;
}

interface HtmlNode {
  nodeName: string;
  value?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
  tagName?: string;
}

interface StaticFont {
  id: string;
  family: string;
  permutation: Permutation;
  file: string;
  woff2: Uint8Array;
  descriptors: FontFaceDescriptors;
}

export interface StaticSiteOptions extends StaticBuildPlannerOptions {
  /** Stable input is supported for reproducible builds; omit it for a fresh CSPRNG seed. */
  seed?: string;
  /** Replace a prior published tree transactionally, or refuse any existing destination. */
  existingOutput?: "replace" | "reject";
}

export interface StaticManifestHtmlFile {
  path: string;
  sourceSha256: string;
  transformed: boolean;
  protectedBlocks: number;
  fonts: readonly string[];
}

export interface StaticBuildManifest {
  version: 1;
  algorithm: "glyphscramble-static-v1";
  seedIdentitySha256: string;
  sourceHtml: readonly StaticManifestHtmlFile[];
  transformedFiles: readonly string[];
  fonts: readonly string[];
  warnings: readonly string[];
}

export interface StaticSiteResult {
  htmlFiles: number;
  protectedBlocks: number;
  fonts: readonly string[];
  transformedFiles: readonly string[];
  outputDir: string;
  manifestFile: "glyphscramble-static-manifest.json";
  manifest: StaticBuildManifest;
  warning: string;
}

export const STATIC_BUILD_WARNING =
  "Static mode supports explicitly marked, non-hydrated HTML only and rotates once per build. Every visitor receives the same recoverable mapping, so CDN caching improves while scraper resistance is lower than per-response mode.";

function attribute(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function encodeDescendants(node: HtmlNode, permutation: Permutation): void {
  if (node.nodeName === "#text" && typeof node.value === "string")
    node.value = encodeText(node.value, permutation);
  for (const child of node.childNodes ?? [])
    encodeDescendants(child, permutation);
}

function walk(node: HtmlNode, visitor: (node: HtmlNode) => void): void {
  visitor(node);
  for (const child of node.childNodes ?? []) walk(child, visitor);
}

function hasProtectedAncestor(node: HtmlNode): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (attribute(parent, "data-glyphscramble-font") !== undefined) return true;
    parent = parent.parentNode;
  }
  return false;
}

function appendAssetLinks(document: HtmlNode): void {
  let head: HtmlNode | undefined;
  walk(document, (node) => {
    if (node.tagName === "head") head = node;
  });
  if (!head) throw new Error("Static HTML has no <head> element.");
  const link: HtmlNode = {
    nodeName: "link",
    tagName: "link",
    attrs: [
      { name: "rel", value: "stylesheet" },
      { name: "href", value: "/_glyphscramble/static.css" },
    ],
    childNodes: [],
    parentNode: head,
  };
  const script: HtmlNode = {
    nodeName: "script",
    tagName: "script",
    attrs: [
      { name: "src", value: "/_glyphscramble/static.js" },
      { name: "defer", value: "" },
    ],
    childNodes: [],
    parentNode: head,
  };
  head.childNodes = [...(head.childNodes ?? []), link, script];
}

function sourcePath(root: string, path: string): string {
  return join(root, ...path.split("/"));
}

function sha256(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function publishDirectory(
  staged: string,
  output: string,
  policy: "replace" | "reject",
): Promise<void> {
  if (!(await exists(output))) {
    await rename(staged, output);
    return;
  }
  if (policy === "reject")
    throw new Error(
      `Static outputDir already exists: ${output}. Remove it or use existingOutput: "replace".`,
    );

  const backup = `${output}.glyphscramble-backup-${randomBytes(12).toString("hex")}`;
  await rename(output, backup);
  try {
    await rename(staged, output);
  } catch (error) {
    try {
      await rename(backup, output);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Static publish failed and the previous output could not be restored from ${backup}.`,
      );
    }
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

function transformHtml(
  source: Uint8Array,
  file: StaticPlannedFile,
  fonts: ReadonlyMap<string, StaticFont>,
): string {
  const document = parse(
    new TextDecoder().decode(source),
  ) as unknown as HtmlNode;
  let blocks = 0;
  walk(document, (node) => {
    const fontId = attribute(node, "data-glyphscramble-font");
    if (fontId === undefined || hasProtectedAncestor(node)) return;
    const font = fonts.get(fontId);
    if (!font)
      throw new Error(
        `${file.path} changed after planning: font ${fontId} is unavailable.`,
      );
    encodeDescendants(node, font.permutation);
    blocks++;
  });
  if (blocks !== file.protectedBlocks)
    throw new Error(
      `${file.path} changed after planning: expected ${file.protectedBlocks} protected block(s), found ${blocks}.`,
    );
  appendAssetLinks(document);
  return serialize(document as never);
}

async function stageSourceTree(
  plan: StaticBuildPlan,
  staged: string,
  fonts: ReadonlyMap<string, StaticFont>,
): Promise<void> {
  for (const directory of plan.directories)
    await mkdir(sourcePath(staged, directory), { recursive: true });
  for (const file of plan.files) {
    const sourceFile = sourcePath(plan.inputDir, file.path);
    const stagedFile = sourcePath(staged, file.path);
    await mkdir(dirname(stagedFile), { recursive: true });
    if (file.kind === "asset") {
      await copyFile(sourceFile, stagedFile);
      continue;
    }
    const source = new Uint8Array(await readFile(sourceFile));
    if (sha256(source) !== file.sourceSha256)
      throw new Error(
        `${file.path} changed after static planning; rerun from a stable source build.`,
      );
    if (!file.transformed) {
      await writeFile(stagedFile, source);
      continue;
    }
    await writeFile(stagedFile, transformHtml(source, file, fonts));
  }
}

async function prepareStaticFonts(
  cwd: string,
  seed: string,
  ids: readonly string[],
): Promise<Map<string, StaticFont>> {
  const fonts = new Map<string, StaticFont>();
  for (const id of ids) {
    const prepared = await loadPreparedFont(id, cwd);
    const permutation = createPermutation(
      prepared.metadata.codepoints,
      seed,
      `static:${id}`,
    );
    const digest = createHash("sha256")
      .update(seed)
      .update(id)
      .digest("hex")
      .slice(0, 12);
    const family = `GlyphScrambleStatic-${id}-${digest}`;
    const file = `${id}-${digest}.woff2`;
    const woff2 = await toWoff2(
      remapCmap(parseSfnt(prepared.sfnt), permutation.decode),
    );
    fonts.set(id, {
      id,
      family,
      permutation,
      file,
      woff2,
      descriptors: prepared.metadata.descriptors,
    });
  }
  return fonts;
}

async function writeStaticAssets(
  cwd: string,
  staged: string,
  fonts: ReadonlyMap<string, StaticFont>,
): Promise<void> {
  if (fonts.size === 0) return;
  const assetDir = join(staged, "_glyphscramble");
  await mkdir(assetDir, { recursive: true });
  const css = [...fonts.values()]
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";src:url("./${font.file}") format("woff2");font-weight:${font.descriptors.weight};font-style:${font.descriptors.style};font-stretch:${font.descriptors.stretch};unicode-range:${font.descriptors.unicodeRange.join(",")};font-display:block}\n` +
        `[data-glyphscramble-font="${font.id}"]{font-family:"${font.family}";visibility:hidden}`,
    )
    .join("\n");
  const loader = `(()=>{const blocks=[...document.querySelectorAll('[data-glyphscramble-font]')];Promise.all(blocks.map(async e=>{const f=getComputedStyle(e).fontFamily;try{await document.fonts.load('1em '+f,e.textContent.slice(0,32));if(!document.fonts.check('1em '+f))throw 0;e.style.visibility='visible';e.dataset.glyphscramble='ready'}catch{e.textContent='This protected content could not be displayed.';e.style.fontFamily='inherit';e.style.visibility='visible';e.dataset.glyphscramble='error'}}))})();\n`;
  await writeFile(join(assetDir, "static.css"), css + "\n");
  await writeFile(join(assetDir, "static.js"), loader);
  for (const font of fonts.values())
    await writeFile(join(assetDir, font.file), font.woff2);
  await cp(
    resolve(cwd, ".glyphscramble/licenses"),
    join(assetDir, "licenses"),
    { recursive: true },
  );
}

function manifestFor(plan: StaticBuildPlan, seed: string): StaticBuildManifest {
  const sourceHtml = plan.files
    .filter(
      (file): file is StaticPlannedFile & { sourceSha256: string } =>
        file.kind === "html" && file.sourceSha256 !== undefined,
    )
    .map((file) => ({
      path: file.path,
      sourceSha256: file.sourceSha256,
      transformed: file.transformed,
      protectedBlocks: file.protectedBlocks,
      fonts: file.fonts,
    }));
  return {
    version: 1,
    algorithm: "glyphscramble-static-v1",
    seedIdentitySha256: sha256(`glyphscramble-static-seed\0${seed}`),
    sourceHtml,
    transformedFiles: sourceHtml
      .filter((file) => file.transformed)
      .map((file) => file.path),
    fonts: plan.fonts,
    warnings: [
      STATIC_BUILD_WARNING,
      ...plan.warnings.map(
        (warning) =>
          `${warning.code}: ${warning.file} ${warning.path}: ${warning.message}`,
      ),
    ],
  };
}

/**
 * Compiles an unprotected static build into a fresh sibling tree. Authors opt
 * in with `data-glyphscramble-font="body"`; hydrated and interactive boundaries
 * are rejected before any destination is changed.
 */
export async function buildStaticSite(
  config: GlyphConfig,
  options: StaticSiteOptions,
): Promise<StaticSiteResult> {
  const cwd = options.cwd ?? process.cwd();
  const plan = await new StaticBuildPlanner(config, options).plan();
  if (options.existingOutput === "reject" && (await exists(plan.outputDir)))
    throw new Error(
      `Static outputDir already exists: ${plan.outputDir}. Remove it or use existingOutput: "replace".`,
    );
  const seed = options.seed ?? randomBytes(32).toString("base64url");
  const fonts = await prepareStaticFonts(cwd, seed, plan.fonts);
  const manifest = manifestFor(plan, seed);
  const outputParent = dirname(plan.outputDir);
  await mkdir(outputParent, { recursive: true });
  const staged = await mkdtemp(
    join(outputParent, `.${basename(plan.outputDir)}.glyphscramble-stage-`),
  );
  let published = false;
  try {
    await stageSourceTree(plan, staged, fonts);
    await writeStaticAssets(cwd, staged, fonts);
    await writeFile(
      join(staged, "glyphscramble-static-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await publishDirectory(
      staged,
      plan.outputDir,
      options.existingOutput ?? "replace",
    );
    published = true;
  } finally {
    if (!published) await rm(staged, { recursive: true, force: true });
  }

  return {
    htmlFiles: plan.htmlFiles,
    protectedBlocks: plan.protectedBlocks,
    fonts: plan.fonts,
    transformedFiles: manifest.transformedFiles,
    outputDir: plan.outputDir,
    manifestFile: "glyphscramble-static-manifest.json",
    manifest,
    warning: STATIC_BUILD_WARNING,
  };
}
