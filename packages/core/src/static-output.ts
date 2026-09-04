import { createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parse, serialize } from "parse5";
import { mapBounded, staticIoConcurrency } from "./bounded-tasks.js";
import { assertStaticErrorText } from "./limits.js";
import { loadPreparedFont, toWoff2 } from "./font-pipeline.js";
import { parseSfnt, remapCmap } from "./sfnt.js";
import {
  StaticBuildPlanner,
  cloneStaticPlannedDocument,
  type StaticBuildPlan,
  type StaticBuildPlannerOptions,
  type StaticHtmlNode,
  type StaticPlannedFile,
} from "./static-plan.js";
import { createPermutation, encodeText, type Permutation } from "./unicode.js";
import type {
  DoctorFinding,
  FontFaceDescriptors,
  GlyphConfig,
} from "./types.js";

const STATIC_ALGORITHM = "glyphscramble-static-v3" as const;
const DEFAULT_FONT_LOAD_TIMEOUT_MS = 8_000;
const MAX_FONT_LOAD_TIMEOUT_MS = 60_000;
const DEFAULT_FAILURE_TEXT = "This protected content could not be displayed.";
const ASSET_ROOT = "_glyphscramble";

type HtmlNode = StaticHtmlNode;

interface StaticFont {
  id: string;
  family: string;
  permutation: Permutation;
  file: string;
  woff2: Uint8Array;
  identity: string;
  descriptors: FontFaceDescriptors;
}

interface PendingAsset {
  file: string;
  bytes: Uint8Array;
  kind: StaticManifestAsset["kind"];
}

interface StaticResources {
  buildId: string;
  manifestFile: string;
  manifestUrl: string;
  cssUrl: string;
  scriptUrl: string;
  files: ReadonlyMap<string, Uint8Array>;
  manifest: StaticBuildManifest;
}

export interface StaticSiteOptions extends StaticBuildPlannerOptions {
  /** Stable input is supported for reproducible builds; omit it for a fresh CSPRNG seed. */
  seed?: string;
  /** Replace a prior published tree transactionally, or refuse any existing destination. */
  existingOutput?: "replace" | "reject";
  /** Overrides `config.static.publicBasePath` for this publication. */
  publicBasePath?: string;
  /** Overrides `config.static.fontLoadTimeoutMs` for this publication. */
  fontLoadTimeoutMs?: number;
  /** Overrides the localized, generic fail-closed status text. */
  errorText?: string;
}

export interface StaticManifestHtmlFile {
  path: string;
  sourceSha256: string;
  transformed: boolean;
  protectedBlocks: number;
  fonts: readonly string[];
  /** Digest of protected encoded text-node structure for mutation detection. */
  readonly protectedTextSha256?: string;
}

export interface StaticManifestAsset {
  path: string;
  sha256: string;
  bytes: number;
  kind: "font" | "style" | "script" | "license";
}

export interface StaticGlyphCspDirectives {
  readonly "default-src": readonly ["'none'"];
  readonly "script-src": readonly ["'self'"];
  readonly "style-src": readonly ["'self'"];
  readonly "font-src": readonly ["'self'"];
}

export interface StaticBuildManifest {
  version: 3;
  algorithm: typeof STATIC_ALGORITHM;
  buildId: string;
  seedIdentitySha256: string;
  publicBasePath: string;
  fontLoadTimeoutMs: number;
  failureText: string;
  assetDirectory: string;
  assets: readonly StaticManifestAsset[];
  fontIdentities: Readonly<Record<string, string>>;
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
  manifestFile: string;
  manifest: StaticBuildManifest;
  warning: string;
}

export const STATIC_BUILD_WARNING =
  "Static mode supports explicitly marked, non-hydrated HTML only and rotates once per build. Every visitor receives the same recoverable mapping, so CDN caching improves while scraper resistance is lower than per-response mode.";

/** Minimal strict CSP for the same-origin, external-only static asset graph. */
export function staticGlyphCspDirectives(): StaticGlyphCspDirectives {
  return Object.freeze({
    "default-src": Object.freeze(["'none'"] as const),
    "script-src": Object.freeze(["'self'"] as const),
    "style-src": Object.freeze(["'self'"] as const),
    "font-src": Object.freeze(["'self'"] as const),
  });
}

function attribute(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function setAttribute(node: HtmlNode, name: string, value: string): void {
  const current = node.attrs?.find((item) => item.name === name);
  if (current) current.value = value;
  else node.attrs = [...(node.attrs ?? []), { name, value }];
}

function appendClass(node: HtmlNode, value: string): void {
  const current = attribute(node, "class")?.split(/\s+/).filter(Boolean) ?? [];
  if (!current.includes(value)) current.push(value);
  setAttribute(node, "class", current.join(" "));
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

function textContent(node: HtmlNode): string {
  let text = "";
  walk(node, (child) => {
    if (child.nodeName === "#text" && typeof child.value === "string")
      text += child.value;
  });
  return text;
}

function hasProtectedAncestor(node: HtmlNode): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (attribute(parent, "data-glyphscramble-font") !== undefined) return true;
    parent = parent.parentNode;
  }
  return false;
}

function topLevelProtectedBlocks(document: HtmlNode): HtmlNode[] {
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

function protectedTextSha256(document: HtmlNode): string {
  const blocks = topLevelProtectedBlocks(document).map((block) => {
    const values: string[] = [];
    walk(block, (node) => {
      if (node.nodeName === "#text" && typeof node.value === "string")
        values.push(node.value);
    });
    return values;
  });
  return sha256(JSON.stringify(blocks));
}

function protectedFontIds(document: HtmlNode): string[] {
  return [
    ...new Set(
      topLevelProtectedBlocks(document)
        .map((block) => attribute(block, "data-glyphscramble-font"))
        .filter((font): font is string => font !== undefined),
    ),
  ].sort();
}

function protectedPresentationContractValid(
  document: HtmlNode,
  failureText: string,
): boolean {
  return topLevelProtectedBlocks(document).every((block) => {
    const parent = block.parentNode;
    const siblings = parent?.childNodes;
    const index = siblings?.indexOf(block) ?? -1;
    const status = index >= 0 ? siblings?.[index + 1] : undefined;
    return (
      attribute(block, "hidden") !== undefined &&
      attribute(block, "aria-hidden") === "true" &&
      attribute(block, "data-glyphscramble-state") === "loading" &&
      (attribute(block, "data-glyphscramble-family")?.length ?? 0) > 0 &&
      status?.tagName === "span" &&
      attribute(status, "role") === "status" &&
      attribute(status, "aria-live") === "polite" &&
      attribute(status, "data-glyphscramble-status") === "pending" &&
      textContent(status) === failureText
    );
  });
}

function appendHeadNode(head: HtmlNode, node: HtmlNode): void {
  node.parentNode = head;
  head.childNodes = [...(head.childNodes ?? []), node];
}

function appendAssetLinks(
  document: HtmlNode,
  resources: StaticResources,
): void {
  let head: HtmlNode | undefined;
  walk(document, (node) => {
    if (node.tagName === "head") head = node;
  });
  if (!head) throw new Error("Static HTML has no <head> element.");
  appendHeadNode(head, {
    nodeName: "meta",
    tagName: "meta",
    attrs: [
      { name: "name", value: "glyphscramble-build" },
      { name: "content", value: resources.buildId },
    ],
    childNodes: [],
  });
  appendHeadNode(head, {
    nodeName: "meta",
    tagName: "meta",
    attrs: [
      { name: "name", value: "glyphscramble-manifest" },
      { name: "content", value: resources.manifestUrl },
    ],
    childNodes: [],
  });
  appendHeadNode(head, {
    nodeName: "link",
    tagName: "link",
    attrs: [
      { name: "rel", value: "stylesheet" },
      { name: "href", value: resources.cssUrl },
    ],
    childNodes: [],
  });
  appendHeadNode(head, {
    nodeName: "script",
    tagName: "script",
    attrs: [
      { name: "src", value: resources.scriptUrl },
      { name: "defer", value: "" },
    ],
    childNodes: [],
  });
}

function sourcePath(root: string, path: string): string {
  return join(root, ...path.split("/"));
}

function sha256(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
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

function normalizePublicBasePath(value: string): string {
  if (
    !/^\/(?:[a-z0-9._~%-]+(?:\/[a-z0-9._~%-]+)*)?\/?$/i.test(value) ||
    /%(?:2f|5c)/i.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error(
      "Static publicBasePath must be a root-relative URL path without a query, fragment, dot segment, or encoded separator.",
    );
  return value === "/" ? "/" : value.replace(/\/+$/, "");
}

function publicAssetUrl(publicBasePath: string, path: string): string {
  return `${publicBasePath === "/" ? "" : publicBasePath}/${path}`;
}

function staticSettings(
  config: GlyphConfig,
  options: StaticSiteOptions,
): {
  publicBasePath: string;
  fontLoadTimeoutMs: number;
  errorText: string;
} {
  const publicBasePath = normalizePublicBasePath(
    options.publicBasePath ?? config.static?.publicBasePath ?? "/",
  );
  const fontLoadTimeoutMs =
    options.fontLoadTimeoutMs ??
    config.static?.fontLoadTimeoutMs ??
    DEFAULT_FONT_LOAD_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(fontLoadTimeoutMs) ||
    fontLoadTimeoutMs < 1 ||
    fontLoadTimeoutMs > MAX_FONT_LOAD_TIMEOUT_MS
  )
    throw new Error(
      `Static fontLoadTimeoutMs must be a positive integer no greater than ${MAX_FONT_LOAD_TIMEOUT_MS}.`,
    );
  const errorText =
    options.errorText ?? config.static?.errorText ?? DEFAULT_FAILURE_TEXT;
  assertStaticErrorText(errorText, "Static errorText");
  return { publicBasePath, fontLoadTimeoutMs, errorText };
}

function statusNode(parent: HtmlNode, failureText: string): HtmlNode {
  return {
    nodeName: "span",
    tagName: "span",
    attrs: [
      { name: "class", value: "glyphscramble-status" },
      { name: "data-glyphscramble-status", value: "pending" },
      { name: "role", value: "status" },
      { name: "aria-live", value: "polite" },
    ],
    childNodes: [{ nodeName: "#text", value: failureText }],
    parentNode: parent,
  };
}

function transformHtml(
  document: HtmlNode,
  file: StaticPlannedFile,
  fonts: ReadonlyMap<string, StaticFont>,
  resources: StaticResources,
): string {
  const blocks = topLevelProtectedBlocks(document);
  for (const node of blocks) {
    const fontId = attribute(node, "data-glyphscramble-font")!;
    const font = fonts.get(fontId);
    if (!font)
      throw new Error(
        `${file.path} changed after planning: font ${fontId} is unavailable.`,
      );
    const parent = node.parentNode;
    if (!parent)
      throw new Error(`${file.path} has a protected block without a parent.`);
    appendClass(node, "glyphscramble-protected");
    appendClass(node, `glyphscramble-font-${font.id}`);
    setAttribute(node, "aria-hidden", "true");
    setAttribute(node, "hidden", "");
    setAttribute(node, "data-glyphscramble-state", "loading");
    setAttribute(node, "data-glyphscramble-family", font.family);
    encodeDescendants(node, font.permutation);
    const siblings = parent.childNodes ?? [];
    const index = siblings.indexOf(node);
    if (index < 0)
      throw new Error(`${file.path} changed while adding failure status.`);
    siblings.splice(
      index + 1,
      0,
      statusNode(parent, resources.manifest.failureText),
    );
    parent.childNodes = siblings;
  }
  if (blocks.length !== file.protectedBlocks)
    throw new Error(
      `${file.path} changed after planning: expected ${file.protectedBlocks} protected block(s), found ${blocks.length}.`,
    );
  appendAssetLinks(document, resources);
  return serialize(document as never);
}

async function stageSourceTree(
  plan: StaticBuildPlan,
  staged: string,
  fonts: ReadonlyMap<string, StaticFont>,
  resources: StaticResources,
  concurrency: number,
): Promise<void> {
  await mapBounded(plan.directories, concurrency, async (directory) => {
    await mkdir(sourcePath(staged, directory), { recursive: true });
  });
  await mapBounded(plan.files, concurrency, async (file) => {
    const sourceFile = sourcePath(plan.inputDir, file.path);
    const stagedFile = sourcePath(staged, file.path);
    await mkdir(dirname(stagedFile), { recursive: true });
    if (file.kind === "asset") {
      await copyFile(sourceFile, stagedFile);
      return;
    }
    const source = new Uint8Array(await readFile(sourceFile));
    if (sha256(source) !== file.sourceSha256)
      throw new Error(
        `${file.path} changed after static planning; rerun from a stable source build.`,
      );
    if (!file.transformed) {
      await writeFile(stagedFile, source);
      return;
    }
    const document = cloneStaticPlannedDocument(plan, file.path);
    if (!document)
      throw new Error(
        `${file.path} has no validated static plan representation; rerun planning and transformation together.`,
      );
    await writeFile(
      stagedFile,
      transformHtml(document, file, fonts, resources),
    );
  });
}

async function prepareStaticFonts(
  cwd: string,
  seed: string,
  seedIdentitySha256: string,
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
    const identity = sha256(
      JSON.stringify({
        algorithm: STATIC_ALGORITHM,
        preparedFontSha256: prepared.metadata.sha256,
        seedIdentitySha256,
        face: prepared.faceId,
        descriptors: prepared.metadata.descriptors,
        coverage: prepared.metadata.coverage,
      }),
    );
    const family = `GlyphScrambleStatic-${id}-${identity.slice(0, 16)}`;
    const woff2 = await toWoff2(
      remapCmap(parseSfnt(prepared.sfnt), permutation.decode),
    );
    const bytesSha256 = sha256(woff2);
    fonts.set(id, {
      id,
      family,
      permutation,
      file: `${id}.${bytesSha256}.woff2`,
      woff2,
      identity,
      descriptors: prepared.metadata.descriptors,
    });
  }
  return fonts;
}

function staticCss(
  fonts: ReadonlyMap<string, StaticFont>,
  timeoutMs: number,
): string {
  const faces = [...fonts.values()]
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";src:url("./${font.file}") format("woff2");font-weight:${font.descriptors.weight};font-style:${font.descriptors.style};font-stretch:${font.descriptors.stretch};unicode-range:${font.descriptors.unicodeRange.join(",")};font-display:block}\n` +
        `.glyphscramble-font-${font.id}{font-family:"${font.family}";font-weight:${font.descriptors.weight};font-style:${font.descriptors.style};font-stretch:${font.descriptors.stretch}}`,
    )
    .join("\n");
  return `${faces}\n.glyphscramble-status{visibility:hidden}.glyphscramble-status[data-glyphscramble-status="pending"]{animation:glyphscramble-static-failure 1ms step-end ${timeoutMs}ms forwards}.glyphscramble-status[data-glyphscramble-status="error"]{visibility:visible}@keyframes glyphscramble-static-failure{to{visibility:visible}}\n`;
}

function staticLoader(timeoutMs: number): string {
  return `(()=>{const t=${timeoutMs};for(const e of document.querySelectorAll('[data-glyphscramble-font][data-glyphscramble-state="loading"]')){const s=e.nextElementSibling;const fail=()=>{e.hidden=true;e.dataset.glyphscrambleState='error';if(s instanceof HTMLElement&&s.hasAttribute('data-glyphscramble-status'))s.dataset.glyphscrambleStatus='error'};(async()=>{let timer;try{if(!(s instanceof HTMLElement)||!s.hasAttribute('data-glyphscramble-status'))throw 0;const family=e.dataset.glyphscrambleFamily;if(!family)throw 0;const style=getComputedStyle(e);const query=style.font;const text=e.textContent||' ';const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('font timeout')),t)});const loaded=await Promise.race([document.fonts.load(query,text),timeout]);if(!Array.isArray(loaded)||loaded.length===0||!document.fonts.check(query,text)||!getComputedStyle(e).fontFamily.includes(family))throw 0;clearTimeout(timer);s.hidden=true;s.dataset.glyphscrambleStatus='ready';e.dataset.glyphscrambleState='ready';e.hidden=false}catch{clearTimeout(timer);fail()}})()}})();\n`;
}

function manifestHtml(
  plan: StaticBuildPlan,
  fonts: ReadonlyMap<string, StaticFont>,
): StaticManifestHtmlFile[] {
  return plan.files
    .filter(
      (file): file is StaticPlannedFile & { sourceSha256: string } =>
        file.kind === "html" && file.sourceSha256 !== undefined,
    )
    .map((file) => {
      const common = {
        path: file.path,
        sourceSha256: file.sourceSha256,
        transformed: file.transformed,
        protectedBlocks: file.protectedBlocks,
        fonts: file.fonts,
      };
      if (!file.transformed) return common;
      const document = cloneStaticPlannedDocument(plan, file.path);
      if (!document)
        throw new Error(
          `${file.path} has no validated static plan representation; rerun planning and publication together.`,
        );
      for (const block of topLevelProtectedBlocks(document)) {
        const fontId = attribute(block, "data-glyphscramble-font")!;
        const font = fonts.get(fontId);
        if (!font)
          throw new Error(
            `${file.path} planned unavailable static font ${fontId}.`,
          );
        encodeDescendants(block, font.permutation);
      }
      return {
        ...common,
        protectedTextSha256: protectedTextSha256(document),
      };
    });
}

interface StaticBuildIdentity {
  algorithm: typeof STATIC_ALGORITHM;
  seedIdentitySha256: string;
  publicBasePath: string;
  fontLoadTimeoutMs: number;
  failureText: string;
  sourceHtml: readonly StaticManifestHtmlFile[];
  fontIdentities: Readonly<Record<string, string>>;
  assets: readonly {
    file: string;
    sha256: string;
    bytes: number;
    kind: StaticManifestAsset["kind"];
  }[];
}

function staticBuildId(identity: StaticBuildIdentity): string {
  return sha256(JSON.stringify(identity));
}

async function buildResources(
  cwd: string,
  plan: StaticBuildPlan,
  seed: string,
  publicBasePath: string,
  fontLoadTimeoutMs: number,
  failureText: string,
  concurrency: number,
): Promise<{ resources: StaticResources; fonts: Map<string, StaticFont> }> {
  const seedIdentitySha256 = sha256(`glyphscramble-static-seed\0${seed}`);
  const fonts = await prepareStaticFonts(
    cwd,
    seed,
    seedIdentitySha256,
    plan.fonts,
  );
  const pending: PendingAsset[] = [...fonts.values()].map((font) => ({
    file: font.file,
    bytes: font.woff2,
    kind: "font",
  }));
  const cssBytes = new TextEncoder().encode(
    staticCss(fonts, fontLoadTimeoutMs),
  );
  const cssFile = `static.${sha256(cssBytes)}.css`;
  pending.push({ file: cssFile, bytes: cssBytes, kind: "style" });
  const scriptBytes = new TextEncoder().encode(staticLoader(fontLoadTimeoutMs));
  const scriptFile = `static.${sha256(scriptBytes)}.js`;
  pending.push({ file: scriptFile, bytes: scriptBytes, kind: "script" });
  const licenses = await mapBounded(plan.fonts, concurrency, async (id) => ({
    id,
    bytes: new Uint8Array(
      await readFile(resolve(cwd, `.glyphscramble/licenses/${id}.LICENSE.txt`)),
    ),
  }));
  for (const { id, bytes } of licenses) {
    pending.push({
      file: `licenses/${id}.LICENSE.txt`,
      bytes,
      kind: "license",
    });
  }
  pending.sort((left, right) => left.file.localeCompare(right.file));
  const sourceHtml = manifestHtml(plan, fonts);
  const fontIdentities = Object.fromEntries(
    [...fonts].map(([id, font]) => [id, font.identity]),
  );
  const buildId = staticBuildId({
    algorithm: STATIC_ALGORITHM,
    seedIdentitySha256,
    publicBasePath,
    fontLoadTimeoutMs,
    failureText,
    sourceHtml,
    fontIdentities,
    assets: pending.map((asset) => ({
      file: asset.file,
      sha256: sha256(asset.bytes),
      bytes: asset.bytes.byteLength,
      kind: asset.kind,
    })),
  });
  const assetDirectory = `${ASSET_ROOT}/${buildId}`;
  const assets = pending.map((asset): StaticManifestAsset => ({
    path: `${assetDirectory}/${asset.file}`,
    sha256: sha256(asset.bytes),
    bytes: asset.bytes.byteLength,
    kind: asset.kind,
  }));
  const manifest: StaticBuildManifest = {
    version: 3,
    algorithm: STATIC_ALGORITHM,
    buildId,
    seedIdentitySha256,
    publicBasePath,
    fontLoadTimeoutMs,
    failureText,
    assetDirectory,
    assets,
    fontIdentities,
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
  const manifestBytes = jsonBytes(manifest);
  const manifestName = `glyphscramble-static-manifest.${sha256(manifestBytes)}.json`;
  const manifestFile = `${assetDirectory}/${manifestName}`;
  const files = new Map(
    pending.map((asset) => [`${assetDirectory}/${asset.file}`, asset.bytes]),
  );
  files.set(manifestFile, manifestBytes);
  return {
    fonts,
    resources: {
      buildId,
      manifestFile,
      manifestUrl: publicAssetUrl(publicBasePath, manifestFile),
      cssUrl: publicAssetUrl(publicBasePath, `${assetDirectory}/${cssFile}`),
      scriptUrl: publicAssetUrl(
        publicBasePath,
        `${assetDirectory}/${scriptFile}`,
      ),
      files,
      manifest,
    },
  };
}

async function writeStaticAssets(
  staged: string,
  resources: StaticResources,
  concurrency: number,
): Promise<void> {
  await mapBounded([...resources.files], concurrency, async ([path, bytes]) => {
    const destination = sourcePath(staged, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  });
}

function safeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  );
}

async function filesBelow(root: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(absolute);
      else found.push(relative(root, absolute).split(sep).join("/"));
    }
  };
  if (await exists(root)) await visit(root);
  return found.sort();
}

function metaValues(document: HtmlNode, name: string): string[] {
  const values: string[] = [];
  walk(document, (node) => {
    if (node.tagName === "meta" && attribute(node, "name") === name) {
      const value = attribute(node, "content");
      if (value !== undefined) values.push(value);
    }
  });
  return values;
}

function pathFromPublicUrl(url: string): string | undefined {
  if (!url.startsWith("/") || url.startsWith("//")) return undefined;
  const marker = `/${ASSET_ROOT}/`;
  const index = url.indexOf(marker);
  if (index < 0 || /[?#]/.test(url)) return undefined;
  return url.slice(index + 1);
}

function addError(
  findings: DoctorFinding[],
  code: string,
  message: string,
  file?: string,
): void {
  findings.push({
    severity: "error",
    code,
    message,
    ...(file ? { file } : {}),
  });
}

function validStaticFailureText(value: unknown): value is string {
  try {
    assertStaticErrorText(value as string, "Manifest failureText");
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies the static deployment as a single build: all transformed documents
 * must reference one byte-valid manifest and every declared asset must match.
 */
export async function verifyStaticOutput(
  outputDir: string,
): Promise<DoctorFinding[]> {
  const root = resolve(outputDir);
  const findings: DoctorFinding[] = [];
  if (!(await exists(root))) {
    addError(
      findings,
      "STATIC-OUTPUT-MISSING",
      "Static output does not exist.",
      root,
    );
    return findings;
  }
  const files = await filesBelow(root);
  const manifestFiles = files.filter((path) =>
    /(?:^|\/)glyphscramble-static-manifest\.[a-f0-9]{64}\.json$/i.test(path),
  );
  if (manifestFiles.length !== 1) {
    addError(
      findings,
      "STATIC-MIXED-BUILD",
      `Expected exactly one content-addressed manifest, found ${manifestFiles.length}.`,
    );
    return findings;
  }
  const manifestFile = manifestFiles[0]!;
  const manifestBytes = new Uint8Array(
    await readFile(sourcePath(root, manifestFile)),
  );
  const namedDigest = basename(manifestFile).match(
    /^glyphscramble-static-manifest\.([a-f0-9]{64})\.json$/i,
  )?.[1];
  if (namedDigest !== sha256(manifestBytes))
    addError(
      findings,
      "STATIC-MANIFEST-HASH",
      "Manifest bytes do not match its content-addressed filename.",
      manifestFile,
    );
  let manifest: StaticBuildManifest;
  try {
    manifest = JSON.parse(
      new TextDecoder().decode(manifestBytes),
    ) as StaticBuildManifest;
  } catch {
    addError(
      findings,
      "STATIC-MANIFEST-JSON",
      "Manifest is not valid JSON.",
      manifestFile,
    );
    return findings;
  }
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    Array.isArray(manifest)
  ) {
    addError(
      findings,
      "STATIC-MANIFEST-CONTRACT",
      "Manifest root must be an object.",
      manifestFile,
    );
    return findings;
  }
  const manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (!Array.isArray(manifest.assets))
    addError(
      findings,
      "STATIC-MANIFEST-CONTRACT",
      "Manifest assets must be an array.",
      manifestFile,
    );
  if (
    manifest.version !== 3 ||
    manifest.algorithm !== STATIC_ALGORITHM ||
    !/^[a-f0-9]{64}$/i.test(manifest.buildId) ||
    manifest.assetDirectory !== `${ASSET_ROOT}/${manifest.buildId}` ||
    dirname(manifestFile).split(sep).join("/") !== manifest.assetDirectory
  )
    addError(
      findings,
      "STATIC-MANIFEST-CONTRACT",
      "Manifest version, algorithm, build ID, or asset directory is invalid.",
      manifestFile,
    );
  const identityFieldsValid =
    typeof manifest.seedIdentitySha256 === "string" &&
    typeof manifest.publicBasePath === "string" &&
    validStaticFailureText(manifest.failureText) &&
    Number.isSafeInteger(manifest.fontLoadTimeoutMs) &&
    Array.isArray(manifest.sourceHtml) &&
    typeof manifest.fontIdentities === "object" &&
    manifest.fontIdentities !== null &&
    manifestAssets.every(
      (asset) =>
        typeof asset === "object" &&
        asset !== null &&
        typeof asset.path === "string" &&
        typeof asset.sha256 === "string" &&
        typeof asset.bytes === "number" &&
        typeof asset.kind === "string",
    );
  if (identityFieldsValid) {
    const rebuilt = staticBuildId({
      algorithm: STATIC_ALGORITHM,
      seedIdentitySha256: manifest.seedIdentitySha256,
      publicBasePath: manifest.publicBasePath,
      fontLoadTimeoutMs: manifest.fontLoadTimeoutMs,
      failureText: manifest.failureText,
      sourceHtml: manifest.sourceHtml,
      fontIdentities: manifest.fontIdentities,
      assets: manifestAssets.map((asset) => ({
        file: asset.path.startsWith(`${manifest.assetDirectory}/`)
          ? asset.path.slice(manifest.assetDirectory.length + 1)
          : asset.path,
        sha256: asset.sha256,
        bytes: asset.bytes,
        kind: asset.kind,
      })),
    });
    if (rebuilt !== manifest.buildId)
      addError(
        findings,
        "STATIC-BUILD-ID",
        "Manifest fields do not reproduce its build ID.",
        manifestFile,
      );
  } else
    addError(
      findings,
      "STATIC-MANIFEST-CONTRACT",
      "Manifest build identity fields are invalid.",
      manifestFile,
    );
  let expectedManifestUrl = "";
  try {
    expectedManifestUrl = publicAssetUrl(
      normalizePublicBasePath(manifest.publicBasePath),
      manifestFile,
    );
  } catch {
    addError(
      findings,
      "STATIC-BASE-PATH",
      "Manifest public base path is invalid.",
      manifestFile,
    );
  }
  const assetPaths = new Set<string>();
  for (const asset of manifestAssets) {
    if (
      typeof asset !== "object" ||
      asset === null ||
      typeof asset.path !== "string" ||
      typeof asset.sha256 !== "string" ||
      typeof asset.bytes !== "number" ||
      typeof asset.kind !== "string"
    )
      continue;
    if (
      !safeRelativePath(asset.path) ||
      !asset.path.startsWith(`${manifest.assetDirectory}/`) ||
      assetPaths.has(asset.path)
    ) {
      addError(
        findings,
        "STATIC-ASSET-PATH",
        "Manifest asset path is unsafe or duplicated.",
        asset.path,
      );
      continue;
    }
    assetPaths.add(asset.path);
    if (!(await exists(sourcePath(root, asset.path)))) {
      addError(
        findings,
        "STATIC-ASSET-MISSING",
        "Declared static asset is missing.",
        asset.path,
      );
      continue;
    }
    const info = await lstat(sourcePath(root, asset.path));
    if (!info.isFile()) {
      addError(
        findings,
        "STATIC-ASSET-TYPE",
        "Declared static asset is not a regular file.",
        asset.path,
      );
      continue;
    }
    const bytes = new Uint8Array(await readFile(sourcePath(root, asset.path)));
    if (bytes.byteLength !== asset.bytes || sha256(bytes) !== asset.sha256)
      addError(
        findings,
        "STATIC-ASSET-HASH",
        "Static asset bytes do not match the manifest.",
        asset.path,
      );
    if (
      asset.kind !== "license" &&
      !basename(asset.path).includes(asset.sha256)
    )
      addError(
        findings,
        "STATIC-ASSET-NAME",
        "Static asset filename does not contain its byte digest.",
        asset.path,
      );
  }
  const transformed = new Set(
    Array.isArray(manifest.transformedFiles) ? manifest.transformedFiles : [],
  );
  const sourceHtml = Array.isArray(manifest.sourceHtml)
    ? manifest.sourceHtml.filter(
        (file): file is StaticManifestHtmlFile =>
          typeof file === "object" &&
          file !== null &&
          typeof file.path === "string" &&
          safeRelativePath(file.path) &&
          /^[a-f0-9]{64}$/i.test(file.sourceSha256) &&
          typeof file.transformed === "boolean" &&
          Number.isSafeInteger(file.protectedBlocks) &&
          file.protectedBlocks >= 0 &&
          Array.isArray(file.fonts) &&
          file.fonts.every((font: unknown) => typeof font === "string") &&
          (!file.transformed ||
            /^[a-f0-9]{64}$/i.test(file.protectedTextSha256 ?? "")),
      )
    : [];
  if (
    !Array.isArray(manifest.sourceHtml) ||
    sourceHtml.length !== manifest.sourceHtml.length
  )
    addError(
      findings,
      "STATIC-MANIFEST-CONTRACT",
      "Manifest sourceHtml entries are invalid.",
      manifestFile,
    );
  if (new Set(sourceHtml.map((file) => file.path)).size !== sourceHtml.length)
    addError(
      findings,
      "STATIC-MANIFEST-CONTRACT",
      "Manifest sourceHtml paths must be unique.",
      manifestFile,
    );
  const declaredHtml = new Map(sourceHtml.map((file) => [file.path, file]));
  if (!Array.isArray(manifest.transformedFiles))
    addError(
      findings,
      "STATIC-MANIFEST-CONTRACT",
      "Manifest transformedFiles must be an array.",
      manifestFile,
    );
  const referenced = new Set<string>();
  for (const path of files.filter((file) => file.endsWith(".html"))) {
    const document = parse(
      await readFile(sourcePath(root, path), "utf8"),
    ) as unknown as HtmlNode;
    const blocks = topLevelProtectedBlocks(document).length;
    const manifests = metaValues(document, "glyphscramble-manifest");
    const builds = metaValues(document, "glyphscramble-build");
    if (blocks === 0 && manifests.length === 0) continue;
    const declared = declaredHtml.get(path);
    if (
      !declared ||
      declared.protectedBlocks !== blocks ||
      !/^[a-f0-9]{64}$/i.test(declared.protectedTextSha256 ?? "") ||
      declared.protectedTextSha256 !== protectedTextSha256(document)
    )
      addError(
        findings,
        "STATIC-HTML-TEXT",
        "Protected encoded text or block structure does not match the independently verified manifest fingerprint.",
        path,
      );
    const declaredFonts = Array.isArray(declared?.fonts)
      ? [...declared.fonts].sort()
      : [];
    if (
      !declared?.transformed ||
      JSON.stringify(declaredFonts) !==
        JSON.stringify(protectedFontIds(document)) ||
      !validStaticFailureText(manifest.failureText) ||
      !protectedPresentationContractValid(document, manifest.failureText)
    )
      addError(
        findings,
        "STATIC-HTML-CONTRACT",
        "Protected font, hidden-state, or generic failure contract does not match the manifest.",
        path,
      );
    if (
      manifests.length !== 1 ||
      manifests[0] !== expectedManifestUrl ||
      pathFromPublicUrl(manifests[0] ?? "") !== manifestFile ||
      builds.length !== 1 ||
      builds[0] !== manifest.buildId
    )
      addError(
        findings,
        "STATIC-HTML-BUILD",
        "Transformed HTML does not reference this build's manifest exactly once.",
        path,
      );
    else referenced.add(path);
  }
  for (const path of transformed)
    if (!referenced.has(path))
      addError(
        findings,
        "STATIC-HTML-MISSING",
        "Manifest transformed file is missing or does not reference this build.",
        path,
      );
  for (const path of referenced)
    if (!transformed.has(path))
      addError(
        findings,
        "STATIC-HTML-UNDECLARED",
        "Transformed HTML is not declared by the manifest.",
        path,
      );
  if (findings.length === 0)
    findings.push({
      severity: "info",
      code: "STATIC-OUTPUT-OK",
      message: `Verified build ${manifest.buildId}: ${manifestAssets.length} asset(s), ${transformed.size} transformed document(s).`,
    });
  return findings;
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
  const concurrency = staticIoConcurrency(options.concurrency);
  const plan = await new StaticBuildPlanner(config, options).plan();
  if (options.existingOutput === "reject" && (await exists(plan.outputDir)))
    throw new Error(
      `Static outputDir already exists: ${plan.outputDir}. Remove it or use existingOutput: "replace".`,
    );
  const settings = staticSettings(config, options);
  const seed = options.seed ?? randomBytes(32).toString("base64url");
  const { resources, fonts } = await buildResources(
    cwd,
    plan,
    seed,
    settings.publicBasePath,
    settings.fontLoadTimeoutMs,
    settings.errorText,
    concurrency,
  );
  const outputParent = dirname(plan.outputDir);
  await mkdir(outputParent, { recursive: true });
  const staged = await mkdtemp(
    join(outputParent, `.${basename(plan.outputDir)}.glyphscramble-stage-`),
  );
  let published = false;
  try {
    await stageSourceTree(plan, staged, fonts, resources, concurrency);
    await writeStaticAssets(staged, resources, concurrency);
    const verification = await verifyStaticOutput(staged);
    const errors = verification.filter((item) => item.severity === "error");
    if (errors.length > 0)
      throw new Error(
        `Generated static output failed verification: ${errors
          .map((item) => `${item.code}${item.file ? ` ${item.file}` : ""}`)
          .join(", ")}`,
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
    transformedFiles: resources.manifest.transformedFiles,
    outputDir: plan.outputDir,
    manifestFile: resources.manifestFile,
    manifest: resources.manifest,
    warning: STATIC_BUILD_WARNING,
  };
}
