import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { parse, serialize } from "parse5";
import { loadPreparedFont, toWoff2 } from "./font-pipeline.js";
import { parseSfnt, remapCmap } from "./sfnt.js";
import { createPermutation, encodeText, type Permutation } from "./unicode.js";
import type { GlyphConfig } from "./types.js";

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
}

export interface StaticSiteOptions {
  inputDir: string;
  outputDir: string;
  cwd?: string;
  /** Stable input is supported for reproducible builds; omit it for a fresh CSPRNG seed. */
  seed?: string;
}

export interface StaticSiteResult {
  htmlFiles: number;
  protectedBlocks: number;
  fonts: readonly string[];
  outputDir: string;
  warning: string;
}

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
    if (attribute(parent, "data-glyphscramble-font")) return true;
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

async function htmlPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await htmlPaths(path)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".html")
      paths.push(path);
  }
  return paths;
}

/**
 * Post-processes a static build. Authors opt in with
 * `data-glyphscramble-font="body"`; unmarked HTML is copied unchanged.
 */
export async function buildStaticSite(
  config: GlyphConfig,
  options: StaticSiteOptions,
): Promise<StaticSiteResult> {
  const cwd = options.cwd ?? process.cwd();
  const input = resolve(cwd, options.inputDir);
  const output = resolve(cwd, options.outputDir);
  if (input === output)
    throw new Error(
      "Static inputDir and outputDir must be different to keep the source build recoverable.",
    );
  await mkdir(output, { recursive: true });
  await cp(input, output, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });

  const seed = options.seed ?? randomBytes(32).toString("base64url");
  const staticFonts = new Map<string, StaticFont>();
  for (const id of Object.keys(config.fonts)) {
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
    staticFonts.set(id, { id, family, permutation, file, woff2 });
  }

  let protectedBlocks = 0;
  const pages = await htmlPaths(output);
  for (const path of pages) {
    const document = parse(await readFile(path, "utf8")) as unknown as HtmlNode;
    let used = false;
    walk(document, (node) => {
      const fontId = attribute(node, "data-glyphscramble-font");
      if (!fontId) return;
      if (hasProtectedAncestor(node)) return;
      const font = staticFonts.get(fontId);
      if (!font)
        throw new Error(
          `${relative(output, path)} uses unknown GlyphScramble font ${fontId}.`,
        );
      encodeDescendants(node, font.permutation);
      protectedBlocks++;
      used = true;
    });
    if (used) appendAssetLinks(document);
    await writeFile(path, serialize(document as never));
  }

  const assetDir = join(output, "_glyphscramble");
  await mkdir(assetDir, { recursive: true });
  const css = [...staticFonts.values()]
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";src:url("./${font.file}") format("woff2");font-display:block}\n` +
        `[data-glyphscramble-font="${font.id}"]{font-family:"${font.family}";visibility:hidden}`,
    )
    .join("\n");
  const loader = `(()=>{const blocks=[...document.querySelectorAll('[data-glyphscramble-font]')];Promise.all(blocks.map(async e=>{const f=getComputedStyle(e).fontFamily;try{await document.fonts.load('1em '+f,e.textContent.slice(0,32));if(!document.fonts.check('1em '+f))throw 0;e.style.visibility='visible';e.dataset.glyphscramble='ready'}catch{e.textContent='This protected content could not be displayed.';e.style.fontFamily='inherit';e.style.visibility='visible';e.dataset.glyphscramble='error'}}))})();\n`;
  await writeFile(join(assetDir, "static.css"), css + "\n");
  await writeFile(join(assetDir, "static.js"), loader);
  for (const font of staticFonts.values())
    await writeFile(join(assetDir, font.file), font.woff2);

  return {
    htmlFiles: pages.length,
    protectedBlocks,
    fonts: [...staticFonts.keys()],
    outputDir: output,
    warning:
      "Static mode rotates once per build. Every visitor receives the same recoverable mapping, so CDN caching improves while scraper resistance is lower than per-response mode.",
  };
}
