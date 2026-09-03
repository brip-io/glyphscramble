import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { parse } from "parse5";
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
  content?: HtmlNode;
}

export interface StaticElementSnapshot {
  readonly tagName: string;
  readonly path: string;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface StaticHydrationDetector {
  readonly name: string;
  detect(element: StaticElementSnapshot): string | undefined;
}

export interface StaticPlanWarning {
  readonly code: "nested-same-font";
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

export interface StaticPlannedFile {
  readonly path: string;
  readonly kind: "html" | "asset";
  readonly sourceSha256?: string;
  readonly transformed: boolean;
  readonly protectedBlocks: number;
  readonly fonts: readonly string[];
}

export interface StaticBuildPlan {
  readonly version: 1;
  readonly inputDir: string;
  readonly outputDir: string;
  readonly directories: readonly string[];
  readonly files: readonly StaticPlannedFile[];
  readonly htmlFiles: number;
  readonly protectedBlocks: number;
  readonly fonts: readonly string[];
  readonly warnings: readonly StaticPlanWarning[];
}

export interface StaticBuildPlannerOptions {
  readonly inputDir: string;
  readonly outputDir: string;
  readonly cwd?: string;
  readonly hydrationDetectors?: readonly StaticHydrationDetector[];
}

export class StaticBuildPlanError extends Error {
  constructor(
    readonly file: string,
    readonly path: string,
    reason: string,
  ) {
    super(`${file} ${path}: ${reason}`);
    this.name = "StaticBuildPlanError";
  }
}

const MARKER = "data-glyphscramble-font";
const MARKER_PATTERN = /\bdata-glyphscramble-font\s*=/i;
const UNSAFE_ELEMENTS = new Map<string, string>([
  ["script", "executable or data scripts can retain or corrupt plaintext"],
  ["style", "raw CSS text cannot be protected"],
  ["noscript", "fallback text would expose a second representation"],
  ["template", "inert template content can later be cloned as plaintext"],
  ["textarea", "form values must remain ordinary accessible text"],
  ["form", "service-critical form content cannot be protected"],
  ["input", "form controls cannot be protected"],
  ["button", "interactive controls cannot be protected"],
  ["select", "form controls cannot be protected"],
  ["option", "form controls cannot be protected"],
  ["optgroup", "form controls cannot be protected"],
  ["fieldset", "form controls cannot be protected"],
  ["label", "form labels must remain ordinary accessible text"],
  ["datalist", "form controls cannot be protected"],
  ["output", "form output cannot be protected"],
  ["a", "interactive navigation labels cannot be protected"],
  ["area", "interactive navigation labels cannot be protected"],
  ["details", "interactive disclosure controls cannot be protected"],
  ["summary", "interactive disclosure controls cannot be protected"],
  ["iframe", "embedded documents cannot be protected"],
  ["object", "embedded resources cannot be protected"],
  ["embed", "embedded resources cannot be protected"],
  ["title", "document metadata cannot be protected"],
  ["meta", "document metadata cannot be protected"],
  ["link", "document metadata cannot be protected"],
  ["base", "document metadata cannot be protected"],
]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
]);
const PLAINTEXT_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-valuetext",
  "placeholder",
  "srcdoc",
  "title",
  "value",
]);

function attr(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name.toLowerCase() === name)?.value;
}

function attributes(node: HtmlNode): Readonly<Record<string, string>> {
  return Object.fromEntries(
    (node.attrs ?? []).map((item) => [item.name.toLowerCase(), item.value]),
  );
}

function children(node: HtmlNode): readonly HtmlNode[] {
  return [...(node.childNodes ?? []), ...(node.content?.childNodes ?? [])];
}

function elementPath(node: HtmlNode): string {
  const parts: string[] = [];
  let current: HtmlNode | undefined = node;
  while (current?.parentNode) {
    if (current.tagName) {
      const siblings = (current.parentNode.childNodes ?? []).filter(
        (item) => item.tagName === current!.tagName,
      );
      parts.push(`${current.tagName}[${siblings.indexOf(current) + 1}]`);
    }
    current = current.parentNode;
  }
  return parts.reverse().join(" > ") || "#document";
}

function snapshot(node: HtmlNode): StaticElementSnapshot {
  return {
    tagName: node.tagName!,
    path: elementPath(node),
    attributes: attributes(node),
  };
}

function namedAttribute(
  element: StaticElementSnapshot,
  names: readonly string[],
): string | undefined {
  return names.find((name) => name in element.attributes);
}

export const DEFAULT_STATIC_HYDRATION_DETECTORS: readonly StaticHydrationDetector[] =
  [
    {
      name: "React/Next",
      detect(element) {
        if (element.attributes.id === "__next") return 'id="__next"';
        return namedAttribute(element, ["data-reactroot", "data-reactid"]);
      },
    },
    {
      name: "Vue/Nuxt",
      detect(element) {
        if (element.attributes.id === "__nuxt") return 'id="__nuxt"';
        return namedAttribute(element, ["data-v-app", "data-server-rendered"]);
      },
    },
    {
      name: "Svelte/SvelteKit",
      detect(element) {
        return Object.keys(element.attributes).find(
          (name) =>
            name === "data-svelte-h" || name.startsWith("data-sveltekit-"),
        );
      },
    },
    {
      name: "Astro",
      detect(element) {
        if (element.tagName === "astro-island") return "<astro-island>";
        return Object.keys(element.attributes).find((name) =>
          name.startsWith("client:"),
        );
      },
    },
    {
      name: "generic hydration",
      detect(element) {
        return (
          namedAttribute(element, [
            "data-hydrate",
            "data-hydrated",
            "data-hydration",
            "ng-version",
          ]) ??
          Object.keys(element.attributes).find((name) =>
            name.startsWith("wire:"),
          )
        );
      },
    },
  ];

function interactiveReason(node: HtmlNode): string | undefined {
  if (!node.tagName) return undefined;
  const tagReason = UNSAFE_ELEMENTS.get(node.tagName);
  if (tagReason) return `<${node.tagName}> is unsafe: ${tagReason}`;
  const values = attributes(node);
  const eventHandler = Object.keys(values).find((name) =>
    name.startsWith("on"),
  );
  if (eventHandler)
    return `${eventHandler} is unsafe: event-bound content may be hydrated`;
  if ("tabindex" in values)
    return "tabindex is unsafe: interactive content cannot be protected";
  if (
    "contenteditable" in values &&
    values.contenteditable.toLowerCase() !== "false"
  )
    return "contenteditable is unsafe: editable content cannot be protected";
  if (values.role && INTERACTIVE_ROLES.has(values.role.toLowerCase()))
    return `role="${values.role}" is unsafe: interactive content cannot be protected`;
  const plaintextAttribute = Object.keys(values).find(
    (name) => PLAINTEXT_ATTRIBUTES.has(name) && values[name] !== "",
  );
  if (plaintextAttribute)
    return `${plaintextAttribute} is unsafe: static mode transforms text nodes only and would leave this attribute in plaintext`;
  return undefined;
}

function hydrationReason(
  node: HtmlNode,
  detectors: readonly StaticHydrationDetector[],
): string | undefined {
  if (!node.tagName) return undefined;
  const element = snapshot(node);
  for (const detector of detectors) {
    const marker = detector.detect(element);
    if (marker)
      return `${detector.name} marker ${marker} identifies a hydrated boundary`;
  }
  return undefined;
}

interface HtmlScan {
  protectedBlocks: number;
  fonts: readonly string[];
  warnings: readonly StaticPlanWarning[];
}

function nodeText(node: HtmlNode): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return children(node).map(nodeText).join("");
}

function documentHydrationReason(
  document: HtmlNode,
): { path: string; reason: string } | undefined {
  let result: { path: string; reason: string } | undefined;
  const visit = (node: HtmlNode): void => {
    if (result) return;
    if (node.tagName === "script") {
      const values = attributes(node);
      const type = values.type?.trim().toLowerCase();
      const source = values.src ?? "";
      const body = nodeText(node);
      const frameworkSource = ["/_next/", "/_nuxt/", "/_app/immutable/"].find(
        (part) => source.includes(part),
      );
      const frameworkPayload = [
        "__NEXT_DATA__",
        "self.__next_f",
        "window.__NUXT__",
      ].find((part) => body.includes(part) || values.id === part);
      if (type === "module" || frameworkSource || frameworkPayload) {
        const marker =
          type === "module"
            ? 'type="module"'
            : frameworkSource
              ? `src containing "${frameworkSource}"`
              : `payload marker "${frameworkPayload}"`;
        result = {
          path: elementPath(node),
          reason: `document script ${marker} may hydrate protected content or retain it in a client bundle`,
        };
        return;
      }
    }
    for (const child of children(node)) visit(child);
  };
  visit(document);
  return result;
}

function scanHtml(
  document: HtmlNode,
  file: string,
  configuredFonts: ReadonlySet<string>,
  detectors: readonly StaticHydrationDetector[],
): HtmlScan {
  let protectedBlocks = 0;
  const fonts = new Set<string>();
  const warnings: StaticPlanWarning[] = [];
  const documentHydration = documentHydrationReason(document);

  const visit = (
    node: HtmlNode,
    active: { font: string; path: string } | undefined,
    unsafeAncestor: { path: string; reason: string } | undefined,
    hydrationAncestor: { path: string; reason: string } | undefined,
  ): void => {
    const path = node.tagName ? elementPath(node) : "#document";
    const ownUnsafe = node.tagName ? interactiveReason(node) : undefined;
    const ownHydration = node.tagName
      ? hydrationReason(node, detectors)
      : undefined;
    const marker = attr(node, MARKER);
    let nextActive = active;

    if (marker !== undefined) {
      if (active) {
        if (marker !== active.font)
          throw new StaticBuildPlanError(
            file,
            path,
            `nested GlyphScramble font "${marker}" conflicts with ancestor font "${active.font}" at ${active.path}`,
          );
        warnings.push({
          code: "nested-same-font",
          file,
          path,
          message: `Nested marker reuses "${marker}" and is compiled as part of the ancestor block.`,
        });
      } else {
        if (!configuredFonts.has(marker))
          throw new StaticBuildPlanError(
            file,
            path,
            `unknown GlyphScramble font "${marker || "(empty)"}"`,
          );
        if (documentHydration)
          throw new StaticBuildPlanError(
            file,
            path,
            `protected block is in a document with a hydration boundary at ${documentHydration.path}: ${documentHydration.reason}`,
          );
        if (unsafeAncestor)
          throw new StaticBuildPlanError(
            file,
            path,
            `protected block is inside unsafe ancestor ${unsafeAncestor.path}: ${unsafeAncestor.reason}`,
          );
        if (hydrationAncestor)
          throw new StaticBuildPlanError(
            file,
            path,
            `protected block is inside hydrated ancestor ${hydrationAncestor.path}: ${hydrationAncestor.reason}`,
          );
        nextActive = { font: marker, path };
        protectedBlocks++;
        fonts.add(marker);
      }
    }

    if (nextActive && ownUnsafe)
      throw new StaticBuildPlanError(file, path, ownUnsafe);
    if (nextActive && ownHydration)
      throw new StaticBuildPlanError(file, path, ownHydration);
    if (nextActive && node.nodeName === "#comment")
      throw new StaticBuildPlanError(
        file,
        active?.path ?? path,
        "HTML comments inside a protected block would remain in plaintext",
      );

    const nextUnsafe =
      unsafeAncestor ?? (ownUnsafe ? { path, reason: ownUnsafe } : undefined);
    const nextHydration =
      hydrationAncestor ??
      (ownHydration ? { path, reason: ownHydration } : undefined);
    for (const child of children(node))
      visit(child, nextActive, nextUnsafe, nextHydration);
  };

  visit(document, undefined, undefined, undefined);
  return {
    protectedBlocks,
    fonts: [...fonts].sort(),
    warnings,
  };
}

function sha256(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function portable(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function missing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function canonicalFuturePath(path: string): Promise<string> {
  const suffix: string[] = [];
  let current = path;
  while (true) {
    try {
      return resolve(await realpath(current), ...suffix);
    } catch (error) {
      if (!missing(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      suffix.unshift(basename(current));
      current = parent;
    }
  }
}

interface TreeEntry {
  path: string;
  directory: boolean;
}

async function sourceTree(root: string): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = join(directory, child.name);
      const path = portable(relative(root, absolute));
      if (child.isSymbolicLink())
        throw new Error(
          `Static input contains unsupported symbolic link ${path}; materialize it before protection.`,
        );
      if (child.isDirectory()) {
        entries.push({ path, directory: true });
        await visit(absolute);
      } else if (child.isFile()) entries.push({ path, directory: false });
      else
        throw new Error(
          `Static input contains unsupported filesystem entry ${path}.`,
        );
    }
  };
  await visit(root);
  return entries;
}

export class StaticBuildPlanner {
  readonly #input: string;
  readonly #output: string;
  readonly #detectors: readonly StaticHydrationDetector[];

  constructor(
    private readonly config: GlyphConfig,
    options: StaticBuildPlannerOptions,
  ) {
    const cwd = options.cwd ?? process.cwd();
    this.#input = resolve(cwd, options.inputDir);
    this.#output = resolve(cwd, options.outputDir);
    this.#detectors = [
      ...DEFAULT_STATIC_HYDRATION_DETECTORS,
      ...(options.hydrationDetectors ?? []),
    ];
    if (
      isWithin(this.#input, this.#output) ||
      isWithin(this.#output, this.#input)
    )
      throw new Error(
        "Static inputDir and outputDir must be separate sibling trees so the source build remains recoverable.",
      );
  }

  async plan(): Promise<StaticBuildPlan> {
    const inputStat = await lstat(this.#input);
    if (!inputStat.isDirectory())
      throw new Error(`Static inputDir is not a directory: ${this.#input}`);
    const [canonicalInput, canonicalOutput] = await Promise.all([
      realpath(this.#input),
      canonicalFuturePath(this.#output),
    ]);
    if (
      isWithin(canonicalInput, canonicalOutput) ||
      isWithin(canonicalOutput, canonicalInput)
    )
      throw new Error(
        "Static inputDir and outputDir resolve to overlapping trees; symlinked paths cannot bypass source-build isolation.",
      );
    const tree = await sourceTree(this.#input);
    const directories = tree
      .filter((entry) => entry.directory)
      .map((entry) => entry.path);
    const files: StaticPlannedFile[] = [];
    const allFonts = new Set<string>();
    const warnings: StaticPlanWarning[] = [];
    let protectedBlocks = 0;
    let htmlFiles = 0;

    for (const entry of tree) {
      if (entry.directory) continue;
      const isHtml = extname(entry.path).toLowerCase() === ".html";
      if (!isHtml) {
        files.push({
          path: entry.path,
          kind: "asset",
          transformed: false,
          protectedBlocks: 0,
          fonts: [],
        });
        continue;
      }
      htmlFiles++;
      const source = new Uint8Array(
        await readFile(join(this.#input, ...entry.path.split("/"))),
      );
      const hash = sha256(source);
      const text = new TextDecoder().decode(source);
      if (!MARKER_PATTERN.test(text)) {
        files.push({
          path: entry.path,
          kind: "html",
          sourceSha256: hash,
          transformed: false,
          protectedBlocks: 0,
          fonts: [],
        });
        continue;
      }
      const markedText = new TextDecoder("utf-8", { fatal: true }).decode(
        source,
      );
      const scanned = scanHtml(
        parse(markedText) as unknown as HtmlNode,
        entry.path,
        new Set(Object.keys(this.config.fonts)),
        this.#detectors,
      );
      for (const font of scanned.fonts) allFonts.add(font);
      protectedBlocks += scanned.protectedBlocks;
      warnings.push(...scanned.warnings);
      files.push({
        path: entry.path,
        kind: "html",
        sourceSha256: hash,
        transformed: scanned.protectedBlocks > 0,
        protectedBlocks: scanned.protectedBlocks,
        fonts: scanned.fonts,
      });
    }

    if (
      files.some((file) => file.path === "glyphscramble-static-manifest.json")
    )
      throw new Error(
        "Static input already contains glyphscramble-static-manifest.json; always compile from the unprotected source build.",
      );
    if (
      allFonts.size > 0 &&
      (directories.includes("_glyphscramble") ||
        files.some((file) => file.path.startsWith("_glyphscramble/")))
    )
      throw new Error(
        "Static input already contains reserved _glyphscramble assets; always compile from the unprotected source build.",
      );

    return {
      version: 1,
      inputDir: this.#input,
      outputDir: this.#output,
      directories,
      files,
      htmlFiles,
      protectedBlocks,
      fonts: [...allFonts].sort(),
      warnings,
    };
  }
}
