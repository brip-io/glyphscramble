import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { loadGlyphConfig } from "./config-loader.js";
import { prepareGlyphFonts } from "./font-pipeline.js";

export type GlyphFramework = "next" | "nuxt" | "sveltekit" | "astro" | "vite";
export type GlyphDeliveryMode = "response" | "static";
export type GlyphPackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface InitCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export type InitCommandRunner = (command: InitCommand) => Promise<void>;

interface IntegrationArtifact {
  readonly path: string;
  readonly content: string;
  /** Exact source that may be replaced after every collision is validated. */
  readonly replace?: string;
  /** Managed template identity; user edits invalidate its embedded digest. */
  readonly managed?: string;
}

export interface InitResult {
  readonly framework: GlyphFramework;
  readonly frameworkVersion?: string;
  readonly mode: GlyphDeliveryMode;
  readonly packageManager: GlyphPackageManager;
  readonly workspaceRoot: string;
  readonly typescript: boolean;
  readonly packageName: string;
  readonly dependencies: readonly string[];
  readonly planned: readonly {
    path: string;
    action: "create" | "update";
  }[];
  readonly created: readonly string[];
  readonly modified: readonly string[];
  readonly existing: readonly string[];
  readonly installed: boolean;
  readonly prepared: boolean;
  readonly dryRun: boolean;
  readonly commands: readonly string[];
  readonly example: string;
  readonly notes: readonly string[];
}

export interface InitProjectOptions {
  readonly cwd?: string;
  readonly framework?: string;
  readonly mode?: GlyphDeliveryMode;
  readonly font?: string;
  readonly licenseSpdx?: string;
  readonly licenseFile?: string;
  readonly acknowledgeAccessibilityRisk?: boolean;
  readonly packageManager?: GlyphPackageManager;
  readonly dryRun?: boolean;
  readonly install?: boolean;
  readonly prepare?: boolean;
  readonly commandRunner?: InitCommandRunner;
}

const execute = promisify(execFile);
const FRAMEWORKS = ["next", "nuxt", "sveltekit", "astro", "vite"] as const;
const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
const GENERATED_PREFIX = "// @glyphscramble-generated ";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function managedArtifact(
  path: string,
  name: string,
  body: string,
): IntegrationArtifact {
  const content = `${GENERATED_PREFIX}${name} sha256:${sha256(body)}\n${body}`;
  return { path, content, managed: name };
}

function managedSourceValid(source: string, name: string): boolean {
  const newline = source.indexOf("\n");
  if (newline < 0) return false;
  const header = source.slice(0, newline);
  const body = source.slice(newline + 1);
  return header === `${GENERATED_PREFIX}${name} sha256:${sha256(body)}`;
}

function displayPath(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join("/") || ".";
}

function parentDirectories(start: string): string[] {
  const directories: string[] = [];
  let current = resolve(start);
  while (true) {
    directories.push(current);
    const parent = dirname(current);
    if (parent === current) return directories;
    current = parent;
  }
}

function packageManagerFromField(
  value: unknown,
): GlyphPackageManager | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.split("@")[0];
  return PACKAGE_MANAGERS.find((candidate) => candidate === name);
}

export function detectPackageManager(
  cwd: string,
  pkg: Record<string, unknown>,
): { packageManager: GlyphPackageManager; workspaceRoot: string } {
  const declared = packageManagerFromField(pkg.packageManager);
  const locks: readonly [GlyphPackageManager, string][] = [
    ["pnpm", "pnpm-lock.yaml"],
    ["pnpm", "pnpm-workspace.yaml"],
    ["yarn", "yarn.lock"],
    ["bun", "bun.lock"],
    ["bun", "bun.lockb"],
    ["npm", "package-lock.json"],
  ];
  for (const directory of parentDirectories(cwd)) {
    const found = locks.find(([, file]) => existsSync(join(directory, file)));
    if (found)
      return {
        packageManager: declared ?? found[0],
        workspaceRoot: directory,
      };
  }
  return { packageManager: declared ?? "npm", workspaceRoot: cwd };
}

function usesTypeScript(cwd: string, pkg: Record<string, unknown>): boolean {
  if (existsSync(join(cwd, "tsconfig.json"))) return true;
  const dependencies = {
    ...(pkg.dependencies as object),
    ...(pkg.devDependencies as object),
  } as Record<string, string>;
  return typeof dependencies.typescript === "string";
}

function frameworkVersion(
  framework: GlyphFramework,
  pkg: Record<string, unknown>,
): string | undefined {
  const dependencies = {
    ...(pkg.dependencies as object),
    ...(pkg.devDependencies as object),
  } as Record<string, string>;
  const name = framework === "sveltekit" ? "@sveltejs/kit" : framework;
  return dependencies[name];
}

function defaultMode(framework: GlyphFramework): GlyphDeliveryMode {
  return framework === "vite" ? "static" : "response";
}

function installCommand(
  packageManager: GlyphPackageManager,
  dependencies: readonly string[],
  cwd: string,
): InitCommand {
  const args = packageManager === "npm" ? ["install"] : ["add"];
  return { command: packageManager, args: [...args, ...dependencies], cwd };
}

function commandText(command: InitCommand): string {
  return [command.command, ...command.args].join(" ");
}

async function defaultCommandRunner(command: InitCommand): Promise<void> {
  await execute(command.command, [...command.args], { cwd: command.cwd });
}

function devCommand(packageManager: GlyphPackageManager): string {
  switch (packageManager) {
    case "npm":
      return "npm run dev";
    case "bun":
      return "bun run dev";
    default:
      return `${packageManager} dev`;
  }
}

function binCommand(
  packageManager: GlyphPackageManager,
  subcommand: string,
): string {
  switch (packageManager) {
    case "npm":
      return `npm exec glyphscramble -- ${subcommand}`;
    case "pnpm":
      return `pnpm exec glyphscramble ${subcommand}`;
    case "yarn":
      return `yarn exec glyphscramble ${subcommand}`;
    case "bun":
      return `bun run glyphscramble ${subcommand}`;
  }
}

function protectedExample(framework: GlyphFramework): string {
  switch (framework) {
    case "next":
      return `const payload = await glyphs.scramble(copy, { font: "body" });\nreturn <GlyphScramble payload={payload} />;`;
    case "nuxt":
      return `const payload = await event.context.glyphscramble.scrambleAsync(copy, { font: "body" });\nreturn { payload }; // pass only payload to <GlyphScramble>`;
    case "sveltekit":
      return `const payload = await locals.glyphscramble.scrambleAsync(copy, { font: "body" });\nreturn { payload }; // pass only payload to <GlyphScramble>`;
    case "astro":
      return `const payload = await Astro.locals.glyphscramble.scrambleAsync(copy, { font: "body" });\n---\n<GlyphScramble payload={payload} />`;
    default:
      return `<article data-glyphscramble-font="body">High-value excerpt only.</article>`;
  }
}

export function detectFramework(pkg: Record<string, unknown>): GlyphFramework {
  const dependencies = {
    ...(pkg.dependencies as object),
    ...(pkg.devDependencies as object),
  } as Record<string, string>;
  if (dependencies.next) return "next";
  if (dependencies.nuxt) return "nuxt";
  if (dependencies["@sveltejs/kit"]) return "sveltekit";
  if (dependencies.astro) return "astro";
  return "vite";
}

function fontSource(font: string): string {
  if (/^https:\/\/fonts\.googleapis\.com\//i.test(font))
    return `{ kind: "google-css", url: ${JSON.stringify(font)} }`;
  if (/^https:\/\//i.test(font))
    return `{ kind: "url", url: ${JSON.stringify(font)} }`;
  return `{ kind: "file", path: ${JSON.stringify(font)} }`;
}

export function configTemplate(options?: {
  font?: string;
  licenseSpdx?: string;
  licenseFile?: string;
}): string {
  const font = options?.font ?? "./fonts/body.woff2";
  const licenseSpdx = options?.licenseSpdx ?? "OFL-1.1";
  const licenseFile = options?.licenseFile ?? "./licenses/OFL.txt";
  return `import { defineGlyphConfig } from "@brip/glyphscramble";

export default defineGlyphConfig({
  fonts: {
    body: {
      source: ${fontSource(font)},
      license: { spdx: ${JSON.stringify(licenseSpdx)}, file: ${JSON.stringify(licenseFile)} },
    },
  },
  // Required: protected blocks are aria-hidden and must be non-essential.
  accessibilityRiskAcknowledged: true,
});
`;
}

function nextArtifacts(
  cwd: string,
  typescript: boolean,
  configFile: string,
): {
  artifacts: IntegrationArtifact[];
  notes: string[];
} {
  const rootApp = join(cwd, "app");
  const sourceApp = join(cwd, "src", "app");
  if (existsSync(rootApp) && existsSync(sourceApp))
    throw new Error(
      "Both app/ and src/app/ exist. Move to one App Router root, then rerun glyphscramble init --framework next.",
    );
  if (
    !existsSync(rootApp) &&
    !existsSync(sourceApp) &&
    (existsSync(join(cwd, "pages")) || existsSync(join(cwd, "src", "pages")))
  )
    throw new Error(
      "Next Pages Router is not supported in v0.1. Create an app/ or src/app/ App Router root, then rerun glyphscramble init --framework next.",
    );

  const sourceRoot = existsSync(sourceApp) ? join(cwd, "src") : cwd;
  const appRoot = join(sourceRoot, "app");
  const helperPath = join(
    sourceRoot,
    `glyphscramble.next.${typescript ? "ts" : "mjs"}`,
  );
  const routePath = join(
    appRoot,
    "%5Fglyphscramble",
    "font",
    "[token]",
    "[face]",
    `route.${typescript ? "ts" : "js"}`,
  );
  const configImport =
    sourceRoot === cwd ? `./${configFile}` : `../${configFile}`;
  const helperImport = relative(dirname(routePath), helperPath)
    .split(sep)
    .join("/")
    .replace(/^(?!\.)/, "./")
    .replace(/\.(?:ts|mjs)$/, "");
  const notes: string[] = [];
  for (const candidate of [
    join(cwd, "proxy.ts"),
    join(cwd, "src", "proxy.ts"),
    join(cwd, "middleware.ts"),
    join(cwd, "src", "middleware.ts"),
  ]) {
    if (existsSync(candidate))
      notes.push(
        `Left existing ${displayPath(cwd, candidate)} unchanged; Next's request-time rendering contract means GlyphScramble does not require Proxy.`,
      );
  }
  return {
    notes,
    artifacts: [
      managedArtifact(
        helperPath,
        "next-helper-v1",
        `import config from "${configImport}";
import { createNextGlyphs } from "@brip/glyphscramble-next/server";

export const glyphs = await createNextGlyphs(config);
`,
      ),
      managedArtifact(
        routePath,
        "next-route-v1",
        `import { glyphs } from "${helperImport}";

// GlyphScramble requires Next's default Node runtime; Edge is unsupported.
export const GET = glyphs.fontRoute;
export const HEAD = glyphs.fontRoute;
`,
      ),
    ],
  };
}

function manualViteInstructions(path: string, configFile: string): string {
  return `${path} is not a simple object-form Vite config that GlyphScramble can patch safely. Add these imports and plugin entry manually, then rerun init:\n\nimport glyphConfig from "./${configFile}";\nimport { glyphscrambleStatic } from "@brip/glyphscramble-vite";\n\nexport default defineConfig({\n  plugins: [glyphscrambleStatic(glyphConfig)],\n});\n\nNo files were changed.`;
}

const NUXT_MODULE = "@brip/glyphscramble-nuxt/module";

function manualNuxtInstructions(path: string): string {
  return `${path} is not a simple object-form Nuxt config that GlyphScramble can patch safely. Add ${JSON.stringify(NUXT_MODULE)} to the modules array manually, then rerun init. No files were changed.`;
}

function patchSimpleNuxtConfig(source: string, path: string): string {
  const match =
    /^(?<prefix>(?:import[^\n]*\n)*\s*export default defineNuxtConfig\(\{\s*\n)(?<body>[\s\S]*)(?<suffix>\n\}\);?\s*)$/.exec(
      source,
    );
  if (!match?.groups) throw new Error(manualNuxtInstructions(path));
  const prefix = match.groups.prefix!;
  const body = match.groups.body!;
  const suffix = match.groups.suffix!;
  const moduleProperties = [...body.matchAll(/^ {2}modules\s*:/gm)];
  if (moduleProperties.length > 1)
    throw new Error(manualNuxtInstructions(path));
  if (moduleProperties.length === 0) {
    if (source.includes("glyphscramble"))
      throw new Error(manualNuxtInstructions(path));
    return `${prefix}  modules: [${JSON.stringify(NUXT_MODULE)}],\n${body}${suffix}`;
  }

  const modules =
    /^(?<indent> {2}modules\s*:\s*)\[(?<entries>[^\]]*)\](?<comma>,?)/m.exec(
      body,
    );
  if (!modules?.groups) throw new Error(manualNuxtInstructions(path));
  const entries = modules.groups.entries!;
  if (entries.includes(NUXT_MODULE)) return source;
  if (source.includes("glyphscramble"))
    throw new Error(manualNuxtInstructions(path));
  const existing = entries.trim();
  const replacement = `${modules.groups.indent!}[\n    ${JSON.stringify(NUXT_MODULE)},${existing ? `\n    ${existing.replace(/\n\s*/g, "\n    ")}` : ""}\n  ]${modules.groups.comma!}`;
  return `${prefix}${body.replace(modules[0], replacement)}${suffix}`;
}

async function nuxtArtifacts(
  cwd: string,
  typescript: boolean,
): Promise<IntegrationArtifact[]> {
  const candidates = [
    "nuxt.config.ts",
    "nuxt.config.mts",
    "nuxt.config.js",
    "nuxt.config.mjs",
  ]
    .map((name) => join(cwd, name))
    .filter(existsSync);
  if (candidates.length > 1)
    throw new Error(
      `Multiple Nuxt config files exist (${candidates.map((path) => displayPath(cwd, path)).join(", ")}). Keep one canonical config, then rerun init. No files were changed.`,
    );
  if (candidates.length === 0)
    return [
      managedArtifact(
        join(cwd, `nuxt.config.${typescript ? "ts" : "mjs"}`),
        "nuxt-config-v1",
        `export default defineNuxtConfig({\n  modules: [${JSON.stringify(NUXT_MODULE)}],\n});\n`,
      ),
    ];
  const path = candidates[0]!;
  const source = await readFile(path, "utf8");
  if (managedSourceValid(source, "nuxt-config-v1"))
    return [
      managedArtifact(
        path,
        "nuxt-config-v1",
        `export default defineNuxtConfig({\n  modules: [${JSON.stringify(NUXT_MODULE)}],\n});\n`,
      ),
    ];
  return [
    {
      path,
      content: patchSimpleNuxtConfig(source, displayPath(cwd, path)),
      replace: source,
    },
  ];
}

const SVELTEKIT_HOOK_BODY = `import { glyphHandle } from "$lib/server/glyphscramble";

export const handle = glyphHandle;
`;

async function svelteKitArtifacts(
  cwd: string,
  typescript: boolean,
): Promise<{
  artifacts: IntegrationArtifact[];
  notes: string[];
}> {
  const hookCandidates = [
    "src/hooks.server.ts",
    "src/hooks.server.js",
    "src/hooks.server.mts",
    "src/hooks.server.mjs",
  ]
    .map((name) => join(cwd, name))
    .filter(existsSync);
  if (hookCandidates.length > 1)
    throw new Error(
      `Multiple SvelteKit server hook files exist (${hookCandidates.map((path) => displayPath(cwd, path)).join(", ")}). Keep one canonical hook, then rerun init. No files were changed.`,
    );

  const helper = managedArtifact(
    join(
      cwd,
      "src",
      "lib",
      "server",
      `glyphscramble.${typescript ? "ts" : "js"}`,
    ),
    "sveltekit-helper-v1",
    `import config from "../../../glyphscramble.config${typescript ? "" : ".mjs"}";
import { createGlyphHandle } from "@brip/glyphscramble-sveltekit";

export const glyphHandle = await createGlyphHandle(config);
`,
  );
  const types = managedArtifact(
    join(cwd, "src", "glyphscramble.d.ts"),
    "sveltekit-locals-v1",
    `import type { ResponseContext } from "@brip/glyphscramble";

declare global {
  namespace App {
    interface Locals {
      glyphscramble?: ResponseContext;
    }
  }
}

export {};
`,
  );
  const generatedHook = managedArtifact(
    join(cwd, "src", `hooks.server.${typescript ? "ts" : "js"}`),
    "sveltekit-hook-v1",
    SVELTEKIT_HOOK_BODY,
  );
  if (hookCandidates.length === 0)
    return {
      notes: [],
      artifacts: [helper, ...(typescript ? [types] : []), generatedHook],
    };

  const existingHook = hookCandidates[0]!;
  const hookPath = displayPath(cwd, existingHook);
  if (
    (await readFile(existingHook, "utf8")) === generatedHook.content ||
    managedSourceValid(
      await readFile(existingHook, "utf8"),
      "sveltekit-hook-v1",
    )
  )
    return {
      notes: [],
      artifacts: [
        helper,
        ...(typescript ? [types] : []),
        { ...generatedHook, path: existingHook },
      ],
    };
  return {
    artifacts: [helper, ...(typescript ? [types] : [])],
    notes: [
      `Left existing ${hookPath} unchanged. Rename its exported handle to appHandle, then compose it after GlyphScramble:\n\nimport { sequence } from "@sveltejs/kit/hooks";\nimport { glyphHandle } from "$lib/server/glyphscramble";\n\nexport const handle = sequence(glyphHandle, appHandle);`,
    ],
  };
}

function patchSimpleViteConfig(
  source: string,
  path: string,
  configFile: string,
): string {
  if (
    source.includes('from "@brip/glyphscramble-vite"') &&
    source.includes("glyphscrambleStatic(glyphConfig)")
  )
    return source;
  if (source.includes("glyphscramble"))
    throw new Error(manualViteInstructions(path, configFile));
  const match =
    /^(?<imports>(?:import[^\n]*\n)+)(?<prefix>\s*export default defineConfig\(\{\s*\n)(?<body>[\s\S]*)(?<suffix>\n\}\);?\s*)$/.exec(
      source,
    );
  if (!match?.groups) throw new Error(manualViteInstructions(path, configFile));
  const importsSource = match.groups.imports!;
  const prefix = match.groups.prefix!;
  const bodySource = match.groups.body!;
  const suffix = match.groups.suffix!;
  const pluginLines = [...bodySource.matchAll(/^ {2}plugins\s*:\s*\[/gm)];
  if (pluginLines.length > 1)
    throw new Error(manualViteInstructions(path, configFile));
  const imports = `${importsSource}import glyphConfig from "./${configFile}";\nimport { glyphscrambleStatic } from "@brip/glyphscramble-vite";\n`;
  const body =
    pluginLines.length === 1
      ? bodySource.replace(
          /^( {2}plugins\s*:\s*\[)/m,
          "$1glyphscrambleStatic(glyphConfig), ",
        )
      : `  plugins: [glyphscrambleStatic(glyphConfig)],\n${bodySource}`;
  return `${imports}${prefix}${body}${suffix}`;
}

async function viteArtifacts(
  cwd: string,
  typescript: boolean,
  configFile: string,
): Promise<IntegrationArtifact[]> {
  const candidates = [
    "vite.config.ts",
    "vite.config.mts",
    "vite.config.js",
    "vite.config.mjs",
  ]
    .map((name) => join(cwd, name))
    .filter(existsSync);
  if (candidates.length > 1)
    throw new Error(
      `Multiple Vite config files exist (${candidates.map((path) => displayPath(cwd, path)).join(", ")}). Keep one canonical config, then rerun init. No files were changed.`,
    );
  if (candidates.length === 0)
    return [
      managedArtifact(
        join(cwd, `vite.config.${typescript ? "ts" : "mjs"}`),
        "vite-config-v1",
        `import { defineConfig } from "vite";\nimport glyphConfig from "./${configFile}";\nimport { glyphscrambleStatic } from "@brip/glyphscramble-vite";\n\nexport default defineConfig({\n  plugins: [glyphscrambleStatic(glyphConfig)],\n});\n`,
      ),
    ];
  const path = candidates[0]!;
  const source = await readFile(path, "utf8");
  return [
    {
      path,
      content: patchSimpleViteConfig(
        source,
        displayPath(cwd, path),
        configFile,
      ),
      replace: source,
    },
  ];
}

async function integrationTemplates(
  framework: GlyphFramework,
  cwd: string,
  typescript: boolean,
  mode: GlyphDeliveryMode,
  configFile: string,
): Promise<{
  artifacts: IntegrationArtifact[];
  packageName: string;
  notes: string[];
}> {
  switch (framework) {
    case "next": {
      const next = nextArtifacts(cwd, typescript, configFile);
      return {
        packageName: "@brip/glyphscramble-next",
        artifacts: next.artifacts,
        notes: next.notes,
      };
    }
    case "nuxt":
      return {
        packageName: "@brip/glyphscramble-nuxt",
        notes: [],
        artifacts: await nuxtArtifacts(cwd, typescript),
      };
    case "sveltekit": {
      const sveltekit = await svelteKitArtifacts(cwd, typescript);
      return {
        packageName: "@brip/glyphscramble-sveltekit",
        notes: sveltekit.notes,
        artifacts: sveltekit.artifacts,
      };
    }
    case "astro":
      if (mode === "static")
        return {
          packageName: "@brip/glyphscramble",
          notes: [
            "Astro static mode runs glyphscramble static after astro build; it rotates once per build and rejects hydrated protected blocks.",
          ],
          artifacts: [],
        };
      return {
        packageName: "@brip/glyphscramble-astro",
        notes: [
          "Astro defaults to a bounded response buffer so lazy rendering can set selective cache headers safely; use explicit route-scoped streaming for large responses.",
        ],
        artifacts: [
          managedArtifact(
            join(cwd, "src", `middleware.${typescript ? "ts" : "js"}`),
            "astro-middleware-v1",
            `import config from "../${configFile}";\nimport { createAstroGlyphMiddleware } from "@brip/glyphscramble-astro";\n\nexport const onRequest = await createAstroGlyphMiddleware(config);\n`,
          ),
          ...(typescript
            ? [
                managedArtifact(
                  join(cwd, "src", "glyphscramble.d.ts"),
                  "astro-locals-v1",
                  `import type { ResponseContext } from "@brip/glyphscramble";\n\ndeclare global {\n  namespace App {\n    interface Locals {\n      glyphscramble?: ResponseContext;\n    }\n  }\n}\n\nexport {};\n`,
                ),
              ]
            : []),
        ],
      };
    default:
      return {
        packageName: "@brip/glyphscramble-vite",
        notes: [
          "Vite output is static per-build protection: mappings are shared until the next build and hydrated blocks are rejected.",
        ],
        artifacts: await viteArtifacts(cwd, typescript, configFile),
      };
  }
}

export async function initProject(
  options: InitProjectOptions = {},
): Promise<InitResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath))
    throw new Error(
      `package.json was not found in ${cwd}. Run init from the application root.`,
    );
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as Record<
    string,
    unknown
  >;
  const detected = options.framework ?? detectFramework(pkg);
  if (!FRAMEWORKS.includes(detected as GlyphFramework))
    throw new Error(
      `Unsupported framework: ${detected}. Use --framework next|nuxt|sveltekit|astro|vite.`,
    );
  const framework = detected as GlyphFramework;
  if (options.mode && !["response", "static"].includes(options.mode))
    throw new Error(
      `Unsupported delivery mode: ${options.mode}. Use response or static.`,
    );
  const mode = options.mode ?? defaultMode(framework);
  if (mode === "static" && !["astro", "vite"].includes(framework))
    throw new Error(
      `${framework} initialization supports per-response mode only. Use --mode response; GlyphScramble never silently downgrades a server integration to a shared static mapping.`,
    );
  if (mode === "response" && framework === "vite")
    throw new Error(
      "Vite client builds cannot provide per-response protection alone. Use --mode static or integrate the generic Node/Fetch server boundary.",
    );

  const detectedPackageManager = detectPackageManager(cwd, pkg);
  const packageManager =
    options.packageManager ?? detectedPackageManager.packageManager;
  if (!PACKAGE_MANAGERS.includes(packageManager))
    throw new Error(
      `Unsupported package manager: ${packageManager}. Use npm, pnpm, yarn, or bun.`,
    );
  const typescript = usesTypeScript(cwd, pkg);
  const configCandidates = [
    "glyphscramble.config.ts",
    "glyphscramble.config.mts",
    "glyphscramble.config.js",
    "glyphscramble.config.mjs",
  ].filter((name) => existsSync(join(cwd, name)));
  if (configCandidates.length > 1)
    throw new Error(
      `Multiple GlyphScramble configs exist (${configCandidates.join(", ")}). Keep one canonical config, then rerun init. No files were changed.`,
    );
  const configFile =
    configCandidates[0] ?? `glyphscramble.config.${typescript ? "ts" : "mjs"}`;
  const configPath = join(cwd, configFile);
  const configExists = configCandidates.length === 1;
  if (!configExists) {
    const missing = [
      options.font ? undefined : "--font",
      options.licenseSpdx ? undefined : "--license-spdx",
      options.licenseFile ? undefined : "--license-file",
      options.acknowledgeAccessibilityRisk
        ? undefined
        : "--acknowledge-accessibility-risk",
    ].filter((value): value is string => value !== undefined);
    if (missing.length > 0)
      throw new Error(
        `New projects require ${missing.join(", ")}. GlyphScramble cannot infer font licensing or accessibility consent.`,
      );
    if (options.licenseFile && !existsSync(resolve(cwd, options.licenseFile)))
      throw new Error(
        `License file ${options.licenseFile} does not exist. Add the font's notice file, then rerun init. No files were changed.`,
      );
    if (
      options.font &&
      !/^https:\/\//i.test(options.font) &&
      !existsSync(resolve(cwd, options.font))
    )
      throw new Error(
        `Font file ${options.font} does not exist. Add the licensed font, then rerun init. No files were changed.`,
      );
  }

  const integration = await integrationTemplates(
    framework,
    cwd,
    typescript,
    mode,
    configFile,
  );

  // Resolve every collision before writing anything, so an initializer error
  // never leaves a half-installed route boundary.
  const existing: string[] = configExists ? [displayPath(cwd, configPath)] : [];
  const resolvedArtifacts: IntegrationArtifact[] = [];
  for (const artifact of integration.artifacts) {
    if (!existsSync(artifact.path)) {
      resolvedArtifacts.push(artifact);
      continue;
    }
    const current = await readFile(artifact.path, "utf8");
    if (current === artifact.content) {
      existing.push(displayPath(cwd, artifact.path));
      continue;
    }
    if (current === artifact.replace) {
      resolvedArtifacts.push(artifact);
      continue;
    }
    if (artifact.managed && managedSourceValid(current, artifact.managed)) {
      resolvedArtifacts.push({ ...artifact, replace: current });
      continue;
    }
    throw new Error(
      `${displayPath(cwd, artifact.path)} already exists and GlyphScramble will not overwrite it. Compose it using the framework guidance or restore the generated template, then rerun init. No files were changed.`,
    );
  }

  const created: string[] = [];
  const modified: string[] = [];
  const pending: IntegrationArtifact[] = [
    ...(configExists
      ? []
      : [
          {
            path: configPath,
            content: configTemplate({
              font: options.font!,
              licenseSpdx: options.licenseSpdx!,
              licenseFile: options.licenseFile!,
            }),
          },
        ]),
    ...resolvedArtifacts,
  ];
  const planned = pending.map((artifact) => ({
    path: displayPath(cwd, artifact.path),
    action: (existsSync(artifact.path) ? "update" : "create") as
      "create" | "update",
  }));
  const manifestDependencies = {
    ...(pkg.dependencies as object),
    ...(pkg.devDependencies as object),
  } as Record<string, string>;
  const desiredDependencies = [
    "@brip/glyphscramble",
    integration.packageName,
  ].filter((value, index, values) => values.indexOf(value) === index);
  const dependencies = desiredDependencies.filter(
    (name) => !(name in manifestDependencies),
  );
  const install = installCommand(packageManager, dependencies, cwd);
  const commands = [
    ...(dependencies.length > 0 ? [commandText(install)] : []),
    binCommand(packageManager, "prepare"),
    devCommand(packageManager),
    binCommand(packageManager, "doctor"),
  ];
  const notes = [...integration.notes];
  const version = frameworkVersion(framework, pkg);
  if (mode === "response") {
    const secret = process.env.GLYPHSCRAMBLE_SECRET;
    if (!secret || secret.length < 32)
      notes.push(
        "Set GLYPHSCRAMBLE_SECRET to at least 32 characters before starting the server; generate one with: openssl rand -base64 48",
      );
  }

  if (options.dryRun)
    return {
      framework,
      ...(version === undefined ? {} : { frameworkVersion: version }),
      mode,
      packageManager,
      workspaceRoot: detectedPackageManager.workspaceRoot,
      typescript,
      packageName: integration.packageName,
      dependencies,
      planned,
      created,
      modified,
      existing,
      installed: false,
      prepared: false,
      dryRun: true,
      commands,
      example: protectedExample(framework),
      notes,
    };

  let installed = false;
  if (options.install && dependencies.length > 0) {
    try {
      await (options.commandRunner ?? defaultCommandRunner)(install);
      installed = true;
    } catch (error) {
      throw new Error(
        `Dependency installation failed before integration files were written. Run ${commandText(install)}, then rerun init --no-install. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const original = new Map<string, string>();
  try {
    for (const artifact of pending) {
      await mkdir(dirname(artifact.path), { recursive: true });
      if (existsSync(artifact.path)) {
        original.set(artifact.path, await readFile(artifact.path, "utf8"));
        await writeFile(artifact.path, artifact.content, { flag: "w" });
        modified.push(displayPath(cwd, artifact.path));
      } else {
        await writeFile(artifact.path, artifact.content, { flag: "wx" });
        created.push(displayPath(cwd, artifact.path));
      }
    }
  } catch (error) {
    await Promise.all([
      ...created.map((path) => rm(resolve(cwd, path), { force: true })),
      ...[...original].map(([path, source]) => writeFile(path, source)),
    ]);
    throw new Error(
      `Initializer writes were rolled back. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let prepared = false;
  if (options.prepare) {
    await prepareGlyphFonts(await loadGlyphConfig(configPath), { cwd });
    prepared = true;
  }

  return {
    framework,
    ...(version === undefined ? {} : { frameworkVersion: version }),
    mode,
    packageManager,
    workspaceRoot: detectedPackageManager.workspaceRoot,
    typescript,
    packageName: integration.packageName,
    dependencies,
    planned,
    created,
    modified,
    existing,
    installed,
    prepared,
    dryRun: false,
    commands,
    example: protectedExample(framework),
    notes,
  };
}
