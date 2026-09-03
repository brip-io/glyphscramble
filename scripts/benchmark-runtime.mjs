import { randomFillSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { URL } from "node:url";
import {
  buildSfnt,
  createGlyphEngine,
  inspectFont,
  loadPreparedFonts,
  parseSfnt,
  prepareGlyphFonts,
  ResponsePoolVariantProvider,
} from "../packages/core/dist/index.js";

const GENERATION_VARIANTS = 5;
const REQUEST_ITERATIONS = 50;
const COLD_ITERATIONS = 3;
const SECRET = "GLYPHSCRAMBLE_BENCHMARK_SECRET";

const require = createRequire(
  new URL("../packages/core/package.json", import.meta.url),
);
const interPath =
  require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
const interSource = new Uint8Array(await readFile(interPath));
const interPrepared = await inspectFont(interSource, "inter-benchmark");

function paddedInterFont(targetBytes) {
  const parsed = parseSfnt(interPrepared.sfnt);
  const padding = new Uint8Array(
    Math.max(1, targetBytes - interPrepared.sfnt.length),
  );
  randomFillSync(padding);
  return buildSfnt({
    ...parsed,
    tables: new Map([...parsed.tables, ["ZZZZ", padding]]),
  });
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (quantile) =>
    Number(
      sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)
      ].toFixed(3),
    );
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

async function run(label, source, ceilings) {
  const cwd = await mkdtemp(join(tmpdir(), `glyphscramble-${label}-`));
  let engine;
  try {
    await mkdir(join(cwd, "fonts"));
    await mkdir(join(cwd, "licenses"));
    await writeFile(join(cwd, "fonts/benchmark.ttf"), source);
    await writeFile(join(cwd, "licenses/OFL.txt"), "Benchmark fixture only\n");
    const config = {
      fonts: {
        body: {
          source: { kind: "file", path: "./fonts/benchmark.ttf" },
          license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
          allowLargeFont: true,
        },
      },
      rotation: {
        scope: "response",
        secretEnv: SECRET,
        tokenTtlSeconds: 60,
      },
      routePrefix: "/_glyphscramble",
      unsupported: "error",
      accessibilityRiskAcknowledged: true,
      maxNormalizedBytes: 2 * 1024 * 1024,
      runtime: {
        poolLowWatermark: GENERATION_VARIANTS,
        poolHighWatermark: GENERATION_VARIANTS,
        generationConcurrency: 2,
        generationQueueLimit: 16,
        generationTimeoutMs: ceilings.generationP95 * 2,
        cacheMaxBytes: source.length * GENERATION_VARIANTS * 4,
      },
    };
    const lock = await prepareGlyphFonts(config, { cwd });
    const normalizedBytes = lock.fonts.body.faces.default.bytes;
    process.env[SECRET] =
      "local benchmark secret with at least thirty two characters";
    const coldPool = [];
    const generationRuns = [];
    for (let index = 0; index < COLD_ITERATIONS; index++) {
      const coldStarted = performance.now();
      const candidate = await createGlyphEngine(config, { cwd });
      coldPool.push(performance.now() - coldStarted);
      generationRuns.push({
        phase: index === 0 ? "process-cold" : "process-warm",
        ...candidate.metrics().generationMilliseconds,
      });
      await candidate.close();
    }

    // Measure request work independently from WOFF2 throughput. This is still
    // the production pool implementation, filled with already-prepared byte
    // payloads so a statistically useful request sample does not generate 50
    // additional compressed fonts.
    const requestFaces = (await loadPreparedFonts("body", cwd)).map((face) => ({
      id: `${face.id}@${face.faceId}`,
      namespace: `${face.id}@${face.faceId}:${face.metadata.identity}`,
      sfnt: face.sfnt,
      codepoints: face.metadata.codepoints,
    }));
    const requestProvider = new ResponsePoolVariantProvider(
      requestFaces,
      {
        poolLowWatermark: REQUEST_ITERATIONS,
        poolHighWatermark: REQUEST_ITERATIONS,
        generationConcurrency: 2,
        generationQueueLimit: REQUEST_ITERATIONS,
        generationTimeoutMs: 1_000,
        cacheMaxBytes: source.length * REQUEST_ITERATIONS * 3,
      },
      () => Promise.resolve(source),
    );
    engine = await createGlyphEngine(config, {
      cwd,
      variantProvider: requestProvider,
    });
    const acquisition = [];
    const response = [];
    const payloads = [];
    const sample = "High value block. ".repeat(625);
    for (let index = 0; index < REQUEST_ITERATIONS; index++) {
      const acquired = performance.now();
      const payload = engine.beginResponse().scramble(sample, { font: "body" });
      acquisition.push(performance.now() - acquired);
      payloads.push(payload);
    }

    // Acquiring a variant schedules an asynchronous pool refill. Let those
    // prepared-byte refills settle before timing the separate font-response
    // phase, otherwise scheduler jitter is charged to whichever request happens
    // to yield next rather than to the pool-generation metric that owns it.
    await new Promise((resolve) => setImmediate(resolve));
    for (const payload of payloads) {
      const responseStarted = performance.now();
      const font = await engine.fontResponse(
        new globalThis.Request(`https://benchmark.invalid${payload.fontUrl}`),
      );
      response.push(performance.now() - responseStarted);
      if (!font.ok)
        throw new Error(`${label} font response returned ${font.status}`);
      await font.arrayBuffer();
    }
    const requestMetrics = engine.metrics();
    const result = {
      label,
      node: process.version,
      normalizedBytes,
      coldPoolMilliseconds: stats(coldPool),
      generationRuns,
      preparedPoolFillMilliseconds: requestMetrics.generationMilliseconds,
      acquisitionMilliseconds: stats(acquisition),
      fontResponseMilliseconds: stats(response),
      ceilings,
      pass:
        stats(coldPool).p95 < ceilings.coldPool &&
        generationRuns
          .filter((run) => run.phase === "process-warm")
          .every((run) => run.p95 < ceilings.generationP95) &&
        stats(acquisition).p95 < 10 &&
        stats(response).p95 < 5 &&
        requestMetrics.poolExhaustions === 0 &&
        requestMetrics.generationFailures === 0,
    };
    return result;
  } finally {
    if (engine) await engine.close();
    delete process.env[SECRET];
    await rm(cwd, { recursive: true, force: true });
  }
}

const results = [
  await run("inter-123kb", interSource, {
    generationP95: 2_000,
    coldPool: 4_000,
  }),
  await run("inter-padded-1mb", paddedInterFont(1024 * 1024), {
    generationP95: 5_000,
    coldPool: 12_000,
  }),
];

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (results.some((result) => !result.pass)) process.exitCode = 1;
