import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export type GlyphFramework = "next" | "nuxt" | "sveltekit" | "astro" | "vite";

interface IntegrationArtifact {
  readonly path: string;
  readonly content: string;
}

export interface InitResult {
  readonly framework: GlyphFramework;
  readonly packageName: string;
  readonly created: readonly string[];
  readonly existing: readonly string[];
  readonly notes: readonly string[];
}

function displayPath(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join("/") || ".";
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

export function configTemplate(): string {
  return `import { defineGlyphConfig } from "@brip/glyphscramble";

export default defineGlyphConfig({
  fonts: {
    body: {
      source: { kind: "file", path: "./fonts/body.woff2" },
      license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
    },
  },
  // Required: protected blocks are aria-hidden and must be non-essential.
  accessibilityRiskAcknowledged: true,
});
`;
}

function nextArtifacts(cwd: string): {
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
  const helperPath = join(sourceRoot, "glyphscramble.next.ts");
  const routePath = join(
    appRoot,
    "%5Fglyphscramble",
    "font",
    "[token]",
    "[face]",
    "route.ts",
  );
  const configImport =
    sourceRoot === cwd ? "./glyphscramble.config" : "../glyphscramble.config";
  const helperImport = relative(dirname(routePath), helperPath)
    .split(sep)
    .join("/")
    .replace(/^(?!\.)/, "./")
    .replace(/\.ts$/, "");
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
      {
        path: helperPath,
        content: `import config from "${configImport}";
import { createNextGlyphs } from "@brip/glyphscramble-next/server";

export const glyphs = await createNextGlyphs(config);
`,
      },
      {
        path: routePath,
        content: `import { glyphs } from "${helperImport}";

// GlyphScramble requires Next's default Node runtime; Edge is unsupported.
export const GET = glyphs.fontRoute;
export const HEAD = glyphs.fontRoute;
`,
      },
    ],
  };
}

function integrationTemplates(
  framework: GlyphFramework,
  cwd: string,
): {
  artifacts: IntegrationArtifact[];
  packageName: string;
  notes: string[];
} {
  switch (framework) {
    case "next": {
      const next = nextArtifacts(cwd);
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
        artifacts: [
          {
            path: join(cwd, "modules", "glyphscramble.ts"),
            content: `export { default } from "@brip/glyphscramble-nuxt/module";\n`,
          },
          {
            path: join(cwd, "server", "middleware", "glyphscramble.ts"),
            content: `import config from "../../glyphscramble.config";\nimport { createNuxtGlyphs } from "@brip/glyphscramble-nuxt";\nimport { defineEventHandler, setResponseHeader, toWebRequest } from "h3";\n\nconst glyphs = await createNuxtGlyphs(config);\nexport default defineEventHandler(async (event) => {\n  const request = toWebRequest(event);\n  if (new URL(request.url).pathname.startsWith(config.routePrefix + "/font/")) return glyphs.engine.fontResponse(request);\n  event.context.glyphscramble = glyphs.engine.beginResponse();\n  setResponseHeader(event, "Cache-Control", "private, no-store");\n});\n`,
          },
        ],
      };
    case "sveltekit":
      return {
        packageName: "@brip/glyphscramble-sveltekit",
        notes: [],
        artifacts: [
          {
            path: join(cwd, "src", "hooks.server.ts"),
            content: `import config from "../glyphscramble.config";\nimport { createGlyphHandle } from "@brip/glyphscramble-sveltekit";\n\nexport const handle = await createGlyphHandle(config);\n`,
          },
        ],
      };
    case "astro":
      return {
        packageName: "@brip/glyphscramble-astro",
        notes: [],
        artifacts: [
          {
            path: join(cwd, "src", "middleware.ts"),
            content: `import config from "../glyphscramble.config";\nimport { createAstroGlyphMiddleware } from "@brip/glyphscramble-astro";\n\nexport const onRequest = await createAstroGlyphMiddleware(config);\n`,
          },
        ],
      };
    default:
      return {
        packageName: "@brip/glyphscramble-vite",
        notes: [],
        artifacts: [
          {
            path: join(cwd, "glyphscramble.vite.ts"),
            content: `import config from "./glyphscramble.config";\nimport { glyphscrambleStatic } from "@brip/glyphscramble-vite";\n\nexport default glyphscrambleStatic(config);\n`,
          },
        ],
      };
  }
}

export async function initProject(
  options: {
    cwd?: string;
    framework?: string;
  } = {},
): Promise<InitResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath))
    throw new Error(`package.json was not found in ${cwd}.`);
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as Record<
    string,
    unknown
  >;
  const detected = options.framework ?? detectFramework(pkg);
  if (!["next", "nuxt", "sveltekit", "astro", "vite"].includes(detected))
    throw new Error(`Unsupported framework: ${detected}`);
  const framework = detected as GlyphFramework;
  const integration = integrationTemplates(framework, cwd);
  const configPath = join(cwd, "glyphscramble.config.ts");
  const configExists = existsSync(configPath);

  // Resolve every collision before writing anything, so an initializer error
  // never leaves a half-installed route boundary.
  const existing: string[] = configExists ? [displayPath(cwd, configPath)] : [];
  for (const artifact of integration.artifacts) {
    if (!existsSync(artifact.path)) continue;
    const current = await readFile(artifact.path, "utf8");
    if (current !== artifact.content)
      throw new Error(
        `${displayPath(cwd, artifact.path)} already exists and GlyphScramble will not overwrite it. Move its behavior into the generated template manually or remove it, then rerun init. No files were changed.`,
      );
    existing.push(displayPath(cwd, artifact.path));
  }

  const created: string[] = [];
  const pending = [
    ...(configExists ? [] : [{ path: configPath, content: configTemplate() }]),
    ...integration.artifacts.filter((artifact) => !existsSync(artifact.path)),
  ];
  for (const artifact of pending) {
    await mkdir(dirname(artifact.path), { recursive: true });
    await writeFile(artifact.path, artifact.content, { flag: "wx" });
    created.push(displayPath(cwd, artifact.path));
  }
  return {
    framework,
    packageName: integration.packageName,
    created,
    existing,
    notes: integration.notes,
  };
}
