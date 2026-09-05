#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { buildStaticSite, verifyStaticOutput } from "./static-output.js";
import { createGlyphEngine } from "./engine.js";
import {
  inspectFont,
  loadPreparedFontFamilies,
  prepareGlyphFonts,
} from "./font-pipeline.js";
import { createPermutation } from "./unicode.js";
import type { DoctorFinding, GlyphConfig } from "./types.js";
import {
  initProject,
  type GlyphDeliveryMode,
  type GlyphPackageManager,
} from "./init.js";
import { discoverGlyphConfigPath, loadGlyphConfig } from "./config-loader.js";
import { PACKAGE_VERSION } from "./generated/version.js";
import { doctorProject } from "./doctor.js";

const HELP = `GlyphScramble by BRIP

Usage:
  glyphscramble init --mode response|static --font <file|https-url> --license-spdx <id> --license-file <path> --acknowledge-accessibility-risk [--framework next|nuxt|sveltekit|astro|vite] [--package-manager npm|pnpm|yarn|bun] [--yes] [--no-install] [--dry-run] [--json]
  glyphscramble prepare [--config <path>]
  glyphscramble inspect <font-file>
  glyphscramble doctor [--root src] [--static-output dist-protected] [--capacity] [--target-rps 10]
  glyphscramble benchmark [--config <path>] [--target-rps 10]
  glyphscramble static --input dist --output dist-protected [--public-base-path /] [--font-timeout-ms 8000] [--concurrency 8] [--existing-output replace|reject] [--config <path>]

GlyphScramble raises the cost of bulk DOM scraping. It is not DRM and does not
stop headless browsers, OCR, font analysis, plaintext APIs, feeds, or metadata.
`;

interface GuidedInitInput {
  framework?: string;
  mode: GlyphDeliveryMode;
  font?: string;
  licenseSpdx?: string;
  licenseFile?: string;
  acknowledgeAccessibilityRisk?: boolean;
  packageManager?: GlyphPackageManager;
}

async function guidedInitInput(values: {
  framework?: string;
  mode?: string;
  font?: string;
  licenseSpdx?: string;
  licenseFile?: string;
  acknowledgeAccessibilityRisk?: boolean;
  packageManager?: string;
  yes?: boolean;
}): Promise<GuidedInitInput> {
  const hasConfig = ["ts", "mts", "js", "mjs"].some((extension) =>
    existsSync(`glyphscramble.config.${extension}`),
  );
  const interactive = Boolean(
    process.stdin.isTTY && process.stdout.isTTY && !values.yes,
  );
  const reader = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined;
  try {
    const ask = async (question: string): Promise<string> =>
      (await reader!.question(question)).trim();
    const mode =
      values.mode ??
      (interactive
        ? await ask("Delivery mode (response/static): ")
        : undefined);
    if (mode !== "response" && mode !== "static")
      throw new Error(
        "init requires --mode response|static in non-interactive use.",
      );
    const font =
      values.font ??
      (!hasConfig && interactive
        ? await ask("Font file or HTTPS URL: ")
        : undefined);
    const licenseSpdx =
      values.licenseSpdx ??
      (!hasConfig && interactive
        ? await ask("Font license SPDX expression: ")
        : undefined);
    const licenseFile =
      values.licenseFile ??
      (!hasConfig && interactive
        ? await ask("Font license/notice file: ")
        : undefined);
    let acknowledgeAccessibilityRisk = values.acknowledgeAccessibilityRisk;
    if (!hasConfig && acknowledgeAccessibilityRisk !== true && interactive) {
      const answer = await ask(
        "Protected blocks are aria-hidden and not WCAG-conformant. Type yes to acknowledge use only for non-essential opted-in content: ",
      );
      acknowledgeAccessibilityRisk = answer.toLowerCase() === "yes";
    }
    const packageManager = values.packageManager;
    if (
      packageManager !== undefined &&
      !["npm", "pnpm", "yarn", "bun"].includes(packageManager)
    )
      throw new Error("--package-manager must be npm, pnpm, yarn, or bun.");
    return {
      ...(values.framework ? { framework: values.framework } : {}),
      mode,
      ...(font ? { font } : {}),
      ...(licenseSpdx ? { licenseSpdx } : {}),
      ...(licenseFile ? { licenseFile } : {}),
      ...(acknowledgeAccessibilityRisk
        ? { acknowledgeAccessibilityRisk: true }
        : {}),
      ...(packageManager
        ? { packageManager: packageManager as GlyphPackageManager }
        : {}),
    };
  } finally {
    reader?.close();
  }
}

function initPreview(result: Awaited<ReturnType<typeof initProject>>): string {
  const lines = [
    `GlyphScramble ${result.mode} setup for ${result.framework}${result.frameworkVersion ? ` ${result.frameworkVersion}` : ""}`,
    `Package manager: ${result.packageManager}`,
  ];
  for (const change of result.planned)
    lines.push(
      `${change.action === "create" ? "Create" : "Update"}: ${change.path}`,
    );
  if (result.dependencies.length)
    lines.push(`Install: ${result.dependencies.join(", ")}`);
  if (!result.planned.length && !result.dependencies.length)
    lines.push("No file or dependency changes are required.");
  return `${lines.join("\n")}\n`;
}

function targetRate(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error("--target-rps must be a positive number.");
  return parsed;
}

async function capacityDoctor(
  configPath: string,
  targetResponsesPerSecond: number | undefined,
): Promise<DoctorFinding[]> {
  const config = await loadGlyphConfig(configPath);
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
        "local glyphscramble capacity probe, never used in production";
  let engine: Awaited<ReturnType<typeof createGlyphEngine>> | undefined;
  try {
    engine = await createGlyphEngine(config);
    const report = engine.capacityReport(targetResponsesPerSecond);
    const findings: DoctorFinding[] = [
      {
        severity:
          report.targetFitsGeneration === false ||
          report.targetFitsCache === false
            ? "warning"
            : "info",
        code: "RUNTIME-CAPACITY",
        message: `Measured ${report.sustainableResponsesPerSecond} response variant(s)/s at p95 ${report.measuredFaceGenerationP95Ms} ms per face; cache retains approximately ${report.cacheLimitedResponses} response variant(s) for a ${report.tokenTtlSeconds}s token TTL.`,
      },
    ];
    for (const message of report.guidance)
      findings.push({
        severity: message.startsWith("Measured") ? "info" : "warning",
        code: "RUNTIME-CAPACITY-GUIDANCE",
        message,
      });
    return findings;
  } finally {
    if (engine) await engine.close();
    for (const [name, value] of oldSecrets) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function benchmark(
  configPath: string,
  targetResponsesPerSecond: number | undefined,
): Promise<void> {
  const config = await loadGlyphConfig(configPath);
  const [familyId, configuredFamily] = Object.entries(config.fonts)[0] ?? [];
  if (!familyId || !configuredFamily) throw new Error("No font configured.");
  const preparedFamilies = await loadPreparedFontFamilies(
    Object.keys(config.fonts),
  );
  const family = preparedFamilies.get(familyId);
  const face = family?.find(
    (candidate) =>
      candidate.faceId === (configuredFamily.defaultFace ?? family[0]?.faceId),
  );
  if (!face) throw new Error("Configured default font face was not prepared.");
  const seed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const permutation = createPermutation(
    face.metadata.codepoints,
    seed,
    "benchmark",
  );
  const candidates = face.metadata.codepoints.filter((cp) =>
    permutation.encode.has(cp),
  );
  if (candidates.length === 0)
    throw new Error("Font has no permutable codepoints.");
  const sample = Array.from({ length: 10_000 }, (_, index) =>
    String.fromCodePoint(candidates[index % candidates.length]!),
  ).join("");
  const iterations = 20;
  const normalizedBytes = [...preparedFamilies.values()].reduce(
    (familyTotal, item) =>
      familyTotal +
      item.reduce(
        (faceTotal, itemFace) => faceTotal + itemFace.sfnt.byteLength,
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
      const protectedPayload = await context.scrambleAsync(sample, {
        font: familyId,
        face: face.faceId,
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
    const capacity = engine.capacityReport(targetResponsesPerSecond);
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
          capacity,
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
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${PACKAGE_VERSION}\n`);
    return;
  }
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: "string" },
      framework: { type: "string" },
      mode: { type: "string" },
      font: { type: "string" },
      "license-spdx": { type: "string" },
      "license-file": { type: "string" },
      "acknowledge-accessibility-risk": {
        type: "boolean",
        default: false,
      },
      "package-manager": { type: "string" },
      yes: { type: "boolean", short: "y", default: false },
      "no-install": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      root: { type: "string", default: "src" },
      input: { type: "string" },
      output: { type: "string" },
      seed: { type: "string" },
      "existing-output": { type: "string", default: "replace" },
      "static-output": { type: "string" },
      "public-base-path": { type: "string" },
      "font-timeout-ms": { type: "string" },
      concurrency: { type: "string" },
      capacity: { type: "boolean", default: false },
      "target-rps": { type: "string" },
    },
  });
  const configPath = (): string =>
    parsed.values.config ?? discoverGlyphConfigPath();
  if (command === "init") {
    const input = await guidedInitInput({
      ...(parsed.values.framework
        ? { framework: parsed.values.framework }
        : {}),
      ...(parsed.values.mode ? { mode: parsed.values.mode } : {}),
      ...(parsed.values.font ? { font: parsed.values.font } : {}),
      ...(parsed.values["license-spdx"]
        ? { licenseSpdx: parsed.values["license-spdx"] }
        : {}),
      ...(parsed.values["license-file"]
        ? { licenseFile: parsed.values["license-file"] }
        : {}),
      acknowledgeAccessibilityRisk:
        parsed.values["acknowledge-accessibility-risk"],
      ...(parsed.values["package-manager"]
        ? { packageManager: parsed.values["package-manager"] }
        : {}),
      yes: parsed.values.yes,
    });
    const preview = await initProject({ ...input, dryRun: true });
    if (!parsed.values.json) process.stdout.write(initPreview(preview));
    if (parsed.values["dry-run"]) {
      if (parsed.values.json)
        process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
      return;
    }
    if (!parsed.values.yes && process.stdin.isTTY && process.stdout.isTTY) {
      const reader = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        const answer = (
          await reader.question("Apply these changes? (yes/no): ")
        )
          .trim()
          .toLowerCase();
        if (answer !== "yes") {
          process.stdout.write("No changes were made.\n");
          return;
        }
      } finally {
        reader.close();
      }
    } else if (!parsed.values.yes)
      throw new Error(
        "Non-interactive init requires --yes to apply changes, or --dry-run to preview them.",
      );
    const result = await initProject({
      ...input,
      install: !parsed.values["no-install"],
      prepare:
        !parsed.values["no-install"] || preview.dependencies.length === 0,
    });
    if (parsed.values.json)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(
        `Initialized ${result.framework} in ${result.mode} mode.\n`,
      );
      if (result.created.length)
        process.stdout.write(`Created: ${result.created.join(", ")}\n`);
      if (result.modified.length)
        process.stdout.write(`Updated: ${result.modified.join(", ")}\n`);
      if (result.existing.length)
        process.stdout.write(
          `Already present: ${result.existing.join(", ")}\n`,
        );
      process.stdout.write(`\nFirst protected block:\n${result.example}\n\n`);
      for (const command of result.commands)
        process.stdout.write(`Next: ${command}\n`);
      for (const note of result.notes) process.stdout.write(`Note: ${note}\n`);
      if (parsed.values.verbose) {
        process.stdout.write(`Workspace root: ${result.workspaceRoot}\n`);
        process.stdout.write(
          `Detected: ${result.typescript ? "TypeScript" : "JavaScript"}; dependencies ${result.installed ? "installed" : "unchanged"}; fonts ${result.prepared ? "prepared" : "not prepared"}.\n`,
        );
      }
    }
  } else if (command === "prepare") {
    const lock = await prepareGlyphFonts(await loadGlyphConfig(configPath()));
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
      : await doctorProject({
          root: parsed.values.root!,
          ...(parsed.values.config ? { configPath: parsed.values.config } : {}),
        });
    if (parsed.values.capacity)
      findings.push(
        ...(await capacityDoctor(
          configPath(),
          targetRate(parsed.values["target-rps"]),
        )),
      );
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
  } else if (command === "benchmark")
    await benchmark(configPath(), targetRate(parsed.values["target-rps"]));
  else if (command === "static") {
    if (!parsed.values.input || !parsed.values.output)
      throw new Error("static requires --input and --output.");
    const existingOutput = parsed.values["existing-output"];
    if (existingOutput !== "replace" && existingOutput !== "reject")
      throw new Error(
        "static --existing-output must be either replace or reject.",
      );
    const result = await buildStaticSite(await loadGlyphConfig(configPath()), {
      inputDir: parsed.values.input,
      outputDir: parsed.values.output,
      existingOutput,
      ...(parsed.values["public-base-path"]
        ? { publicBasePath: parsed.values["public-base-path"] }
        : {}),
      ...(parsed.values["font-timeout-ms"]
        ? { fontLoadTimeoutMs: Number(parsed.values["font-timeout-ms"]) }
        : {}),
      ...(parsed.values.concurrency
        ? { concurrency: Number(parsed.values.concurrency) }
        : {}),
      ...(parsed.values.seed ? { seed: parsed.values.seed } : {}),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `glyphscramble: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
