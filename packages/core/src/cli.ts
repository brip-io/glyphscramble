#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildStaticSite } from "./static-site.js";
import { inspectFont, prepareGlyphFonts } from "./font-pipeline.js";
import { createPermutation, encodeText } from "./unicode.js";
import type { DoctorFinding, GlyphConfig } from "./types.js";

const HELP = `GlyphScramble by BRIP

Usage:
  glyphscramble init [--framework next|nuxt|sveltekit|astro|vite]
  glyphscramble prepare [--config glyphscramble.config.ts]
  glyphscramble inspect <font-file>
  glyphscramble doctor [--root src]
  glyphscramble benchmark [--config glyphscramble.config.ts]
  glyphscramble static --input dist --output dist-protected [--config glyphscramble.config.ts]

GlyphScramble raises the cost of bulk DOM scraping. It is not DRM and does not
stop headless browsers, OCR, font analysis, plaintext APIs, feeds, or metadata.
`;

async function loadConfig(path: string): Promise<GlyphConfig> {
  const absolute = resolve(path);
  if (!existsSync(absolute))
    throw new Error(`Configuration not found: ${absolute}`);
  const imported = (await import(
    `${pathToFileURL(absolute).href}?t=${Date.now()}`
  )) as { default?: GlyphConfig };
  if (!imported.default) throw new Error(`${path} must have a default export.`);
  return imported.default;
}

function detectFramework(pkg: Record<string, unknown>): string {
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

function configTemplate(): string {
  return `import { defineGlyphConfig } from "@brip/glyphscramble";

export default defineGlyphConfig({
  fonts: {
    body: {
      source: { kind: "file", path: "./fonts/body.woff2" },
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
  // Required: protected blocks are aria-hidden and must be non-essential.
  accessibilityRiskAcknowledged: true,
});
`;
}

interface IntegrationArtifact {
  path: string;
  content: string;
}

function integrationTemplates(framework: string): {
  artifacts: IntegrationArtifact[];
  packageName: string;
} {
  switch (framework) {
    case "next":
      return {
        packageName: "@brip/glyphscramble-next",
        artifacts: [
          {
            path: "glyphscramble.next.ts",
            content: `import config from "./glyphscramble.config";\nimport { createNextGlyphs } from "@brip/glyphscramble-next";\n\nexport const glyphs = await createNextGlyphs(config);\n`,
          },
          {
            path: "app/_glyphscramble/font/[token]/[face]/route.ts",
            content: `import { glyphs } from "../../../../../glyphscramble.next";\n\nexport const dynamic = "force-dynamic";\nexport const GET = glyphs.fontRoute;\nexport const HEAD = glyphs.fontRoute;\n`,
          },
          {
            path: "proxy.ts",
            content: `import { NextResponse, type NextRequest } from "next/server";\nimport { markNextRequestHeaders } from "@brip/glyphscramble-next";\n\nexport function proxy(request: NextRequest) {\n  const requestHeaders = markNextRequestHeaders(request.headers);\n  const response = NextResponse.next({ request: { headers: requestHeaders } });\n  response.headers.set("Cache-Control", "private, no-store");\n  return response;\n}\n`,
          },
        ],
      };
    case "nuxt":
      return {
        packageName: "@brip/glyphscramble-nuxt",
        artifacts: [
          {
            path: "modules/glyphscramble.ts",
            content: `export { default } from "@brip/glyphscramble-nuxt/module";\n`,
          },
          {
            path: "server/middleware/glyphscramble.ts",
            content: `import config from "../../glyphscramble.config";\nimport { createNuxtGlyphs } from "@brip/glyphscramble-nuxt";\nimport { defineEventHandler, setResponseHeader, toWebRequest } from "h3";\n\nconst glyphs = await createNuxtGlyphs(config);\nexport default defineEventHandler(async (event) => {\n  const request = toWebRequest(event);\n  if (new URL(request.url).pathname.startsWith(config.routePrefix + "/font/")) return glyphs.engine.fontResponse(request);\n  event.context.glyphscramble = glyphs.engine.beginResponse();\n  setResponseHeader(event, "Cache-Control", "private, no-store");\n});\n`,
          },
        ],
      };
    case "sveltekit":
      return {
        packageName: "@brip/glyphscramble-sveltekit",
        artifacts: [
          {
            path: "src/hooks.server.ts",
            content: `import config from "../glyphscramble.config";\nimport { createGlyphHandle } from "@brip/glyphscramble-sveltekit";\n\nexport const handle = await createGlyphHandle(config);\n`,
          },
        ],
      };
    case "astro":
      return {
        packageName: "@brip/glyphscramble-astro",
        artifacts: [
          {
            path: "src/middleware.ts",
            content: `import config from "../glyphscramble.config";\nimport { createAstroGlyphMiddleware } from "@brip/glyphscramble-astro";\n\nexport const onRequest = await createAstroGlyphMiddleware(config);\n`,
          },
        ],
      };
    default:
      return {
        packageName: "@brip/glyphscramble-vite",
        artifacts: [
          {
            path: "glyphscramble.vite.ts",
            content: `import config from "./glyphscramble.config";\nimport { glyphscrambleStatic } from "@brip/glyphscramble-vite";\n\nexport default glyphscrambleStatic(config);\n`,
          },
        ],
      };
  }
}

async function init(frameworkOverride?: string): Promise<void> {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as Record<
    string,
    unknown
  >;
  const framework = frameworkOverride ?? detectFramework(pkg);
  const integration = integrationTemplates(framework);
  if (!existsSync("glyphscramble.config.ts"))
    await writeFile("glyphscramble.config.ts", configTemplate());
  for (const artifact of integration.artifacts) {
    await mkdir(dirname(resolve(artifact.path)), { recursive: true });
    if (!existsSync(artifact.path))
      await writeFile(artifact.path, artifact.content);
  }
  process.stdout.write(
    `Initialized ${framework}. Install @brip/glyphscramble and ${integration.packageName}, add a licensed font, then run glyphscramble prepare.\n`,
  );
}

async function sourceFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  if (!existsSync(root)) return paths;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await sourceFiles(path)));
    else if (
      [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".vue",
        ".svelte",
        ".astro",
        ".html",
      ].includes(extname(path))
    )
      paths.push(path);
  }
  return paths;
}

async function doctor(root: string): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    if (
      /^["']use client["'];?/m.test(source) &&
      /\.scramble\s*\(/.test(source)
    ) {
      findings.push({
        severity: "error",
        code: "CLIENT-PLAINTEXT",
        message:
          "scramble() runs in a client module; plaintext may enter a JavaScript chunk.",
        file,
      });
    }
    if (
      /<(?:h[1-6]|button|label|form|input|textarea)[^>]*data-glyphscramble/iu.test(
        source,
      )
    ) {
      findings.push({
        severity: "warning",
        code: "ESSENTIAL-CONTENT",
        message:
          "Protected navigation, headings, or form content creates SEO and accessibility risk.",
        file,
      });
    }
    if (/aria-label\s*=.*(?:encodedText|glyph)/iu.test(source)) {
      findings.push({
        severity: "warning",
        code: "A11Y-MIRROR",
        message:
          "Do not expose scrambled or plaintext content through an ARIA mirror.",
        file,
      });
    }
  }
  if (findings.length === 0)
    findings.push({
      severity: "info",
      code: "OK",
      message: "No obvious client leakage or essential-content usage found.",
    });
  return findings;
}

async function benchmark(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  const lock = await prepareGlyphFonts(config);
  const face = Object.values(lock.fonts)[0];
  if (!face) throw new Error("No font configured.");
  const seed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const permutation = createPermutation(face.codepoints, seed, "benchmark");
  const candidates = face.codepoints.filter((cp) => permutation.encode.has(cp));
  if (candidates.length === 0)
    throw new Error("Font has no permutable codepoints.");
  const sample = Array.from({ length: 10_000 }, (_, index) =>
    String.fromCodePoint(candidates[index % candidates.length]!),
  ).join("");
  const timings: number[] = [];
  for (let index = 0; index < 30; index++) {
    const start = performance.now();
    encodeText(sample, permutation);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.floor(timings.length * 0.95)]!;
  process.stdout.write(
    JSON.stringify(
      {
        scalars: 10_000,
        p95Milliseconds: Number(p95.toFixed(3)),
        targetMilliseconds: 5,
        pass: p95 < 5,
      },
      null,
      2,
    ) + "\n",
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    process.stdout.write(HELP);
    return;
  }
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: "string", default: "glyphscramble.config.ts" },
      framework: { type: "string" },
      root: { type: "string", default: "src" },
      input: { type: "string" },
      output: { type: "string" },
      seed: { type: "string" },
    },
  });
  if (command === "init") await init(parsed.values.framework);
  else if (command === "prepare") {
    const lock = await prepareGlyphFonts(
      await loadConfig(parsed.values.config!),
    );
    process.stdout.write(
      `Prepared ${Object.keys(lock.fonts).length} font(s).\n`,
    );
  } else if (command === "inspect") {
    const file = parsed.positionals[0];
    if (!file) throw new Error("inspect requires a font file.");
    const inspected = await inspectFont(
      new Uint8Array(await readFile(file)),
      basename(file),
    );
    process.stdout.write(JSON.stringify(inspected.metadata, null, 2) + "\n");
  } else if (command === "doctor") {
    const findings = await doctor(parsed.values.root!);
    process.stdout.write(
      findings
        .map(
          (item) =>
            `${item.severity.toUpperCase()} ${item.code}${item.file ? ` ${item.file}` : ""}: ${item.message}`,
        )
        .join("\n") + "\n",
    );
    if (findings.some((item) => item.severity === "error"))
      process.exitCode = 1;
  } else if (command === "benchmark") await benchmark(parsed.values.config!);
  else if (command === "static") {
    if (!parsed.values.input || !parsed.values.output)
      throw new Error("static requires --input and --output.");
    const result = await buildStaticSite(
      await loadConfig(parsed.values.config!),
      {
        inputDir: parsed.values.input,
        outputDir: parsed.values.output,
        ...(parsed.values.seed ? { seed: parsed.values.seed } : {}),
      },
    );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `glyphscramble: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
