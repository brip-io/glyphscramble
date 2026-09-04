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
import { mapBounded, staticIoConcurrency } from "./bounded-tasks.js";
import { loadPreparedFont } from "./font-pipeline.js";
import type { GlyphConfig } from "./types.js";
import {
  assertTextSupported,
  createPermutationPlan,
  UnsupportedTextError,
} from "./unicode.js";

interface HtmlAttribute {
  name: string;
  value: string;
}

export interface StaticHtmlNode {
  nodeName: string;
  value?: string;
  attrs?: HtmlAttribute[];
  childNodes?: StaticHtmlNode[];
  parentNode?: StaticHtmlNode;
  tagName?: string;
  content?: StaticHtmlNode;
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
  /** Bounded file I/O and HTML planning concurrency. Defaults to 8. */
  readonly concurrency?: number;
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

function attr(node: StaticHtmlNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name.toLowerCase() === name)?.value;
}

function attributes(node: StaticHtmlNode): Readonly<Record<string, string>> {
  return Object.fromEntries(
    (node.attrs ?? []).map((item) => [item.name.toLowerCase(), item.value]),
  );
}

function children(node: StaticHtmlNode): readonly StaticHtmlNode[] {
  return [...(node.childNodes ?? []), ...(node.content?.childNodes ?? [])];
}

interface ElementPathRef {
  readonly parent?: ElementPathRef;
  readonly tagName: string;
  readonly index: number;
  rendered?: string;
}

function indexElementPaths(
  document: StaticHtmlNode,
): WeakMap<StaticHtmlNode, ElementPathRef> {
  const paths = new WeakMap<StaticHtmlNode, ElementPathRef>();
  const visit = (
    node: StaticHtmlNode,
    nearest: ElementPathRef | undefined,
  ): void => {
    const counts = new Map<string, number>();
    for (const child of children(node)) {
      let childPath = nearest;
      if (child.tagName) {
        const index = (counts.get(child.tagName) ?? 0) + 1;
        counts.set(child.tagName, index);
        const indexed: ElementPathRef = {
          ...(nearest === undefined ? {} : { parent: nearest }),
          tagName: child.tagName,
          index,
        };
        childPath = indexed;
        paths.set(child, indexed);
      }
      visit(child, childPath);
    }
  };
  visit(document, undefined);
  return paths;
}

function renderElementPath(path: ElementPathRef | undefined): string {
  if (!path) return "#document";
  if (path.rendered) return path.rendered;
  const missing: ElementPathRef[] = [];
  let current: ElementPathRef | undefined = path;
  while (current && !current.rendered) {
    missing.push(current);
    current = current.parent;
  }
  let rendered = current?.rendered ?? "";
  while (missing.length > 0) {
    const part = missing.pop()!;
    rendered = `${rendered}${rendered ? " > " : ""}${part.tagName}[${part.index}]`;
    part.rendered = rendered;
  }
  return rendered;
}

function elementPath(
  node: StaticHtmlNode,
  paths: WeakMap<StaticHtmlNode, ElementPathRef>,
): string {
  return renderElementPath(paths.get(node));
}

function snapshot(
  node: StaticHtmlNode,
  paths: WeakMap<StaticHtmlNode, ElementPathRef>,
): StaticElementSnapshot {
  const values = Object.freeze({ ...attributes(node) });
  return {
    tagName: node.tagName!,
    get path() {
      return elementPath(node, paths);
    },
    attributes: values,
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

function interactiveReason(node: StaticHtmlNode): string | undefined {
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
  node: StaticHtmlNode,
  detectors: readonly StaticHydrationDetector[],
  paths: WeakMap<StaticHtmlNode, ElementPathRef>,
): string | undefined {
  if (!node.tagName) return undefined;
  const element = snapshot(node, paths);
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
  protectedText: readonly ProtectedTextSpan[];
}

interface ProtectedTextSpan {
  readonly file: string;
  readonly path: string;
  readonly font: string;
  readonly text: string;
}

function nodeText(node: StaticHtmlNode): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return children(node).map(nodeText).join("");
}

function documentHydrationReason(
  document: StaticHtmlNode,
  paths: WeakMap<StaticHtmlNode, ElementPathRef>,
): { path: string; reason: string } | undefined {
  let result: { path: string; reason: string } | undefined;
  const visit = (node: StaticHtmlNode): void => {
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
          path: elementPath(node, paths),
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
  document: StaticHtmlNode,
  file: string,
  configuredFonts: ReadonlySet<string>,
  detectors: readonly StaticHydrationDetector[],
): HtmlScan {
  let protectedBlocks = 0;
  const fonts = new Set<string>();
  const warnings: StaticPlanWarning[] = [];
  const protectedText: ProtectedTextSpan[] = [];
  const paths = indexElementPaths(document);
  const relevant = new WeakSet<StaticHtmlNode>();
  const markRelevant = (node: StaticHtmlNode): boolean => {
    let containsMarker = attr(node, MARKER) !== undefined;
    for (const child of children(node))
      containsMarker = markRelevant(child) || containsMarker;
    if (containsMarker) relevant.add(node);
    return containsMarker;
  };
  if (!markRelevant(document))
    return { protectedBlocks: 0, fonts: [], warnings: [], protectedText: [] };
  const documentHydration = documentHydrationReason(document, paths);

  const visit = (
    node: StaticHtmlNode,
    active: { font: string; path: string } | undefined,
    unsafeAncestor: { path: string; reason: string } | undefined,
    hydrationAncestor: { path: string; reason: string } | undefined,
    nearestPath: ElementPathRef | undefined,
  ): void => {
    if (!active && !relevant.has(node)) return;
    const currentPath = node.tagName ? paths.get(node) : nearestPath;
    const path = (): string => renderElementPath(currentPath);
    const ownUnsafe = node.tagName ? interactiveReason(node) : undefined;
    const ownHydration = node.tagName
      ? hydrationReason(node, detectors, paths)
      : undefined;
    const marker = attr(node, MARKER);
    let nextActive = active;

    if (marker !== undefined) {
      if (active) {
        if (marker !== active.font)
          throw new StaticBuildPlanError(
            file,
            path(),
            `nested GlyphScramble font "${marker}" conflicts with ancestor font "${active.font}" at ${active.path}`,
          );
        warnings.push({
          code: "nested-same-font",
          file,
          path: path(),
          message: `Nested marker reuses "${marker}" and is compiled as part of the ancestor block.`,
        });
      } else {
        if (!configuredFonts.has(marker))
          throw new StaticBuildPlanError(
            file,
            path(),
            `unknown GlyphScramble font "${marker || "(empty)"}"`,
          );
        if (documentHydration)
          throw new StaticBuildPlanError(
            file,
            path(),
            `protected block is in a document with a hydration boundary at ${documentHydration.path}: ${documentHydration.reason}`,
          );
        if (unsafeAncestor)
          throw new StaticBuildPlanError(
            file,
            path(),
            `protected block is inside unsafe ancestor ${unsafeAncestor.path}: ${unsafeAncestor.reason}`,
          );
        if (hydrationAncestor)
          throw new StaticBuildPlanError(
            file,
            path(),
            `protected block is inside hydrated ancestor ${hydrationAncestor.path}: ${hydrationAncestor.reason}`,
          );
        nextActive = { font: marker, path: path() };
        protectedBlocks++;
        fonts.add(marker);
      }
    }

    if (nextActive && ownUnsafe)
      throw new StaticBuildPlanError(file, path(), ownUnsafe);
    if (nextActive && ownHydration)
      throw new StaticBuildPlanError(file, path(), ownHydration);
    if (nextActive && node.nodeName === "#comment")
      throw new StaticBuildPlanError(
        file,
        active?.path ?? path(),
        "HTML comments inside a protected block would remain in plaintext",
      );
    if (
      nextActive &&
      node.nodeName === "#text" &&
      typeof node.value === "string" &&
      node.value.length > 0
    )
      protectedText.push({
        file,
        path: path(),
        font: nextActive.font,
        text: node.value,
      });

    const nextUnsafe =
      unsafeAncestor ??
      (ownUnsafe ? { path: path(), reason: ownUnsafe } : undefined);
    const nextHydration =
      hydrationAncestor ??
      (ownHydration ? { path: path(), reason: ownHydration } : undefined);
    for (const child of children(node))
      visit(child, nextActive, nextUnsafe, nextHydration, currentPath);
  };

  visit(document, undefined, undefined, undefined, undefined);
  return {
    protectedBlocks,
    fonts: [...fonts].sort(),
    warnings,
    protectedText,
  };
}

function sha256(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

const plannedDocuments = new WeakMap<
  StaticBuildPlan,
  ReadonlyMap<string, StaticHtmlNode>
>();

/** Internal handoff used by the static publisher after it revalidates bytes. */
export function cloneStaticPlannedDocument(
  plan: StaticBuildPlan,
  path: string,
): StaticHtmlNode | undefined {
  const document = plannedDocuments.get(plan)?.get(path);
  return document ? structuredClone(document) : undefined;
}

async function validateProtectedText(
  cwd: string,
  spans: readonly ProtectedTextSpan[],
  concurrency: number,
): Promise<void> {
  const fontIds = [...new Set(spans.map((span) => span.font))].sort();
  const prepared = await mapBounded(fontIds, concurrency, async (font) => {
    const face = await loadPreparedFont(font, cwd);
    const encodable = new Set(
      createPermutationPlan(face.metadata.codepoints).groups.flatMap((group) =>
        group.values.length < 2 ? [] : group.values,
      ),
    );
    return [font, { face: face.faceId, encodable }] as const;
  });
  const byFont = new Map(prepared);
  for (const span of spans) {
    const font = byFont.get(span.font)!;
    try {
      assertTextSupported(span.text, (codepoint) =>
        font.encodable.has(codepoint),
      );
    } catch (error) {
      if (!(error instanceof UnsupportedTextError)) throw error;
      throw new StaticBuildPlanError(
        span.file,
        span.path,
        `font "${span.font}" face "${font.face}" cannot encode protected text: ${error.message} Choose a prepared face whose coverage and Unicode property groups include this scalar, adjust the explicit coverage subset, or leave this block unprotected.`,
      );
    }
  }
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
  readonly #cwd: string;
  readonly #input: string;
  readonly #output: string;
  readonly #detectors: readonly StaticHydrationDetector[];
  readonly #concurrency: number;

  constructor(
    private readonly config: GlyphConfig,
    options: StaticBuildPlannerOptions,
  ) {
    const cwd = options.cwd ?? process.cwd();
    this.#cwd = cwd;
    this.#input = resolve(cwd, options.inputDir);
    this.#output = resolve(cwd, options.outputDir);
    this.#concurrency = staticIoConcurrency(options.concurrency);
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
    const documents = new Map<string, StaticHtmlNode>();
    const allFonts = new Set<string>();
    const warnings: StaticPlanWarning[] = [];
    const protectedText: ProtectedTextSpan[] = [];
    let protectedBlocks = 0;
    const fileEntries = tree.filter((entry) => !entry.directory);
    const configuredFonts = new Set(Object.keys(this.config.fonts));
    const planned = await mapBounded(
      fileEntries,
      this.#concurrency,
      async (
        entry,
      ): Promise<{
        file: StaticPlannedFile;
        document?: StaticHtmlNode;
        scan?: HtmlScan;
      }> => {
        const isHtml = extname(entry.path).toLowerCase() === ".html";
        if (!isHtml) {
          return {
            file: {
              path: entry.path,
              kind: "asset",
              transformed: false,
              protectedBlocks: 0,
              fonts: [],
            },
          };
        }
        const source = new Uint8Array(
          await readFile(join(this.#input, ...entry.path.split("/"))),
        );
        const hash = sha256(source);
        const text = new TextDecoder().decode(source);
        if (!MARKER_PATTERN.test(text)) {
          return {
            file: {
              path: entry.path,
              kind: "html",
              sourceSha256: hash,
              transformed: false,
              protectedBlocks: 0,
              fonts: [],
            },
          };
        }
        const markedText = new TextDecoder("utf-8", { fatal: true }).decode(
          source,
        );
        const document = parse(markedText) as unknown as StaticHtmlNode;
        const scanned = scanHtml(
          document,
          entry.path,
          configuredFonts,
          this.#detectors,
        );
        return {
          file: {
            path: entry.path,
            kind: "html",
            sourceSha256: hash,
            transformed: scanned.protectedBlocks > 0,
            protectedBlocks: scanned.protectedBlocks,
            fonts: scanned.fonts,
          },
          document,
          scan: scanned,
        };
      },
    );
    const files = planned.map(({ file }) => file);
    for (const result of planned) {
      const scanned = result.scan;
      if (!scanned) continue;
      for (const font of scanned.fonts) allFonts.add(font);
      protectedBlocks += scanned.protectedBlocks;
      warnings.push(...scanned.warnings);
      protectedText.push(...scanned.protectedText);
      if (result.file.transformed && result.document)
        documents.set(result.file.path, result.document);
    }

    await validateProtectedText(this.#cwd, protectedText, this.#concurrency);

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

    const plan: StaticBuildPlan = {
      version: 1,
      inputDir: this.#input,
      outputDir: this.#output,
      directories,
      files,
      htmlFiles: files.filter((file) => file.kind === "html").length,
      protectedBlocks,
      fonts: [...allFonts].sort(),
      warnings,
    };
    plannedDocuments.set(plan, documents);
    return plan;
  }
}
