#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { buildStaticSite, verifyStaticOutput } from "./static-output.js";
import { createGlyphEngine } from "./engine.js";
import { inspectFont, prepareGlyphFonts } from "./font-pipeline.js";
import { createPermutation } from "./unicode.js";
import type { DoctorFinding, GlyphConfig } from "./types.js";
import { initProject } from "./init.js";
import { loadGlyphConfig } from "./config-loader.js";

const HELP = `GlyphScramble by BRIP

Usage:
  glyphscramble init [--framework next|nuxt|sveltekit|astro|vite]
  glyphscramble prepare [--config glyphscramble.config.ts]
  glyphscramble inspect <font-file>
  glyphscramble doctor [--root src] [--static-output dist-protected]
  glyphscramble benchmark [--config glyphscramble.config.ts]
  glyphscramble static --input dist --output dist-protected [--public-base-path /] [--font-timeout-ms 8000] [--existing-output replace|reject] [--config glyphscramble.config.ts]

GlyphScramble raises the cost of bulk DOM scraping. It is not DRM and does not
stop headless browsers, OCR, font analysis, plaintext APIs, feeds, or metadata.
`;

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
  const config = await loadGlyphConfig(configPath);
  const lock = await prepareGlyphFonts(config);
  const family = Object.values(lock.fonts)[0];
  if (!family) throw new Error("No font configured.");
  const face = family.faces[family.defaultFace];
  if (!face) throw new Error("Configured default font face was not prepared.");
  const seed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const permutation = createPermutation(face.codepoints, seed, "benchmark");
  const candidates = face.codepoints.filter((cp) => permutation.encode.has(cp));
  if (candidates.length === 0)
    throw new Error("Font has no permutable codepoints.");
  const sample = Array.from({ length: 10_000 }, (_, index) =>
    String.fromCodePoint(candidates[index % candidates.length]!),
  ).join("");
  const iterations = 20;
  const normalizedBytes = Object.values(lock.fonts).reduce(
    (familyTotal, item) =>
      familyTotal +
      Object.values(item.faces).reduce(
        (faceTotal, itemFace) => faceTotal + itemFace.bytes,
        0,
      ),
    0,
  );
  const benchmarkConfig: GlyphConfig = {
    ...config,
    runtime: {
      ...config.runtime,
      variantMode: "response-pool",
      poolLowWatermark: iterations,
      poolHighWatermark: iterations,
      cacheMaxBytes: Math.max(
        config.runtime?.cacheMaxBytes ?? 0,
        normalizedBytes * iterations * 2,
      ),
    },
  };
  const secretEnvironments = [
    config.rotation.secretEnv,
    ...(config.rotation.previousKeys ?? []).map((key) => key.secretEnv),
  ];
  const oldSecrets = new Map(
    secretEnvironments.map((name) => [name, process.env[name]]),
  );
  for (const name of secretEnvironments)
    if (!process.env[name])
      process.env[name] =
        "local glyphscramble benchmark secret, never used in production";
  const encoding: number[] = [];
  const acquisition: number[] = [];
  const response: number[] = [];
  let engine: Awaited<ReturnType<typeof createGlyphEngine>> | undefined;
  const coldStarted = performance.now();
  try {
    engine = await createGlyphEngine(benchmarkConfig);
    const coldPoolMilliseconds = performance.now() - coldStarted;
    for (let index = 0; index < iterations; index++) {
      const acquisitionStarted = performance.now();
      const context = engine.beginResponse();
      const encodingStarted = performance.now();
      const protectedPayload = context.scramble(sample, {
        font: family.id,
        face: face.id,
      });
      encoding.push(performance.now() - encodingStarted);
      acquisition.push(performance.now() - acquisitionStarted);
      const responseStarted = performance.now();
      const fontResponse = await engine.fontResponse(
        new Request(`https://benchmark.invalid${protectedPayload.fontUrl}`),
      );
      response.push(performance.now() - responseStarted);
      if (!fontResponse.ok)
        throw new Error(
          `Benchmark font response failed: ${fontResponse.status}`,
        );
      await fontResponse.arrayBuffer();
    }
    const metrics = engine.metrics();
    const encodingStats = timingStats(encoding);
    const acquisitionStats = timingStats(acquisition);
    const responseStats = timingStats(response);
    process.stdout.write(
      JSON.stringify(
        {
          node: process.version,
          mode: "response-pool",
          iterations,
          scalarsPerResponse: 10_000,
          normalizedBytes,
          coldPoolMilliseconds: Number(coldPoolMilliseconds.toFixed(3)),
          backgroundGenerationMilliseconds: metrics.generationMilliseconds,
          responseAcquisitionMilliseconds: acquisitionStats,
          preparedFontResponseMilliseconds: responseStats,
          gates: {
            encodingP95Under5ms: encodingStats.p95 < 5,
            preparedFontResponseP95Under5ms: responseStats.p95 < 5,
            noPoolExhaustion: metrics.poolExhaustions === 0,
            noGenerationFailure: metrics.generationFailures === 0,
          },
          encodingMilliseconds: encodingStats,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    if (engine) await engine.close();
    for (const [name, value] of oldSecrets) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function timingStats(values: readonly number[]): {
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (quantile: number) =>
    Number(
      sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)
      ]!.toFixed(3),
    );
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
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
      "existing-output": { type: "string", default: "replace" },
      "static-output": { type: "string" },
      "public-base-path": { type: "string" },
      "font-timeout-ms": { type: "string" },
    },
  });
  if (command === "init") {
    const result = await initProject({
      ...(parsed.values.framework
        ? { framework: parsed.values.framework }
        : {}),
    });
    process.stdout.write(
      `Initialized ${result.framework}. Install @brip/glyphscramble and ${result.packageName}, add a licensed font, then run glyphscramble prepare.\n`,
    );
    if (result.created.length)
      process.stdout.write(`Created: ${result.created.join(", ")}\n`);
    if (result.existing.length)
      process.stdout.write(`Already present: ${result.existing.join(", ")}\n`);
    for (const note of result.notes) process.stdout.write(`Note: ${note}\n`);
  } else if (command === "prepare") {
    const lock = await prepareGlyphFonts(
      await loadGlyphConfig(parsed.values.config!),
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
    const findings = parsed.values["static-output"]
      ? await verifyStaticOutput(parsed.values["static-output"])
      : await doctor(parsed.values.root!);
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
    const existingOutput = parsed.values["existing-output"];
    if (existingOutput !== "replace" && existingOutput !== "reject")
      throw new Error(
        "static --existing-output must be either replace or reject.",
      );
    const result = await buildStaticSite(
      await loadGlyphConfig(parsed.values.config!),
      {
        inputDir: parsed.values.input,
        outputDir: parsed.values.output,
        existingOutput,
        ...(parsed.values["public-base-path"]
          ? { publicBasePath: parsed.values["public-base-path"] }
          : {}),
        ...(parsed.values["font-timeout-ms"]
          ? { fontLoadTimeoutMs: Number(parsed.values["font-timeout-ms"]) }
          : {}),
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
