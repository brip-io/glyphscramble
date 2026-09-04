import { randomFillSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { setImmediate } from "node:timers/promises";
import { URL } from "node:url";
import {
  buildSfnt,
  createGlyphEngine,
  createPermutationPlan,
  inspectFont,
  loadPreparedFonts,
  parseSfnt,
  prepareGlyphFonts,
  ResponsePoolVariantProvider,
} from "../packages/core/dist/index.js";
import { evaluateSmokeGate } from "../packages/core/dist/benchmark-policy.js";

const GENERATION_VARIANTS = 5;
const REQUEST_ITERATIONS = 50;
const REQUEST_WARMUP_ITERATIONS = 10;
const REQUEST_VARIANTS = REQUEST_ITERATIONS + REQUEST_WARMUP_ITERATIONS;
const COLD_ITERATIONS = 3;
const LARGE_REPERTOIRE_CODEPOINTS = 20_000;
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

async function waitForProviderIdle(provider) {
  const deadline = performance.now() + 5_000;
  while (true) {
    const metrics = provider.metrics();
    if (metrics.queueDepth === 0 && metrics.activeGenerators === 0) return;
    if (performance.now() >= deadline)
      throw new Error("Prepared request-provider refill did not become idle.");
    await setImmediate();
  }
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
      const poolFillMilliseconds = performance.now() - coldStarted;
      coldPool.push(poolFillMilliseconds);
      const capacity = candidate.capacityReport();
      const measuredPoolFillResponsesPerSecond =
        (GENERATION_VARIANTS * 1_000) / poolFillMilliseconds;
      generationRuns.push({
        phase: index === 0 ? "process-cold" : "process-warm",
        poolFillMilliseconds: Number(poolFillMilliseconds.toFixed(3)),
        predictedResponsesPerSecond: capacity.sustainableResponsesPerSecond,
        measuredPoolFillResponsesPerSecond: Number(
          measuredPoolFillResponsesPerSecond.toFixed(3),
        ),
        predictionRatio: Number(
          (
            measuredPoolFillResponsesPerSecond /
            capacity.sustainableResponsesPerSecond
          ).toFixed(3),
        ),
        ...candidate.metrics().generationMilliseconds,
      });
      await candidate.close();
    }

    // Measure request work independently from WOFF2 throughput. This is still
    // the production pool implementation, filled with already-prepared byte
    // payloads so a statistically useful request sample does not generate 50
    // additional compressed fonts.
    const largeRepertoire = Array.from(
      { length: LARGE_REPERTOIRE_CODEPOINTS },
      (_, index) => 0x4e00 + index,
    );
    const requestFaces = (await loadPreparedFonts("body", cwd)).map((face) => ({
      id: `${face.id}@${face.faceId}`,
      namespace: `${face.id}@${face.faceId}:${face.metadata.identity}`,
      sfnt: face.sfnt,
      // The provider owns this deliberately large plan. scramble() must consume
      // its retained lookup rather than performing repertoire-sized work.
      permutationPlan: createPermutationPlan([
        ...face.metadata.codepoints,
        ...largeRepertoire,
      ]),
    }));
    const requestProvider = new ResponsePoolVariantProvider(
      requestFaces,
      {
        poolLowWatermark: REQUEST_VARIANTS,
        poolHighWatermark: REQUEST_VARIANTS,
        generationConcurrency: 2,
        generationQueueLimit: REQUEST_VARIANTS,
        generationTimeoutMs: 1_000,
        acquisitionTimeoutMs: 50,
        acquisitionQueueLimit: REQUEST_VARIANTS,
        workerRecycleAfter: 256,
        drainTimeoutMs: 1_000,
        cacheMaxBytes:
          (source.length + LARGE_REPERTOIRE_CODEPOINTS * 8) *
          REQUEST_VARIANTS *
          2,
      },
      () => Promise.resolve(source),
    );
    engine = await createGlyphEngine(config, {
      cwd,
      variantProvider: requestProvider,
    });
    const encoding = [];
    const response = [];
    const payloads = [];
    const warmupPayloads = [];
    const sample = "High value block. "
      .repeat(Math.ceil(10_000 / "High value block. ".length))
      .slice(0, 10_000);
    for (let index = 0; index < REQUEST_WARMUP_ITERATIONS; index++)
      warmupPayloads.push(
        await engine.beginResponse().scrambleAsync(sample, { font: "body" }),
      );
    await waitForProviderIdle(requestProvider);
    for (const payload of warmupPayloads) {
      const font = await engine.fontResponse(
        new globalThis.Request(`https://benchmark.invalid${payload.fontUrl}`),
      );
      if (!font.ok)
        throw new Error(
          `${label} warmup font response returned ${font.status}`,
        );
      await font.arrayBuffer();
    }
    for (let index = 0; index < REQUEST_ITERATIONS; index++) {
      const acquired = performance.now();
      const payload = await engine
        .beginResponse()
        .scrambleAsync(sample, { font: "body" });
      encoding.push(performance.now() - acquired);
      payloads.push(payload);
    }

    // Acquiring a variant schedules an asynchronous pool refill. Let those
    // prepared-byte refills settle before timing the separate font-response
    // phase, otherwise scheduler jitter is charged to whichever request happens
    // to yield next rather than to the pool-generation metric that owns it.
    await waitForProviderIdle(requestProvider);
    const fontResponses = [];
    for (const payload of payloads) {
      const responseStarted = performance.now();
      const font = await engine.fontResponse(
        new globalThis.Request(`https://benchmark.invalid${payload.fontUrl}`),
      );
      response.push(performance.now() - responseStarted);
      if (!font.ok)
        throw new Error(`${label} font response returned ${font.status}`);
      fontResponses.push(font);
    }

    // Drain bodies only after all response-construction samples are captured.
    // A one-megabyte arrayBuffer allocation may trigger GC; consuming inside
    // the timed loop would charge that previous body's GC pause to the next
    // token lookup even though body consumption itself is outside the metric.
    for (const font of fontResponses) {
      await font.arrayBuffer();
    }
    const requestMetrics = engine.metrics();
    const warmGenerationSamples = generationRuns
      .filter((run) => run.phase === "process-warm")
      .flatMap((run) => run.samples);
    const predictionRatios = generationRuns
      .filter((run) => run.phase === "process-warm")
      .map((run) => run.predictionRatio);
    const capacityPrediction = {
      lowerRatio: 0.5,
      upperRatio: 1.25,
      ratios: predictionRatios,
      pass: predictionRatios.every((ratio) => ratio >= 0.5 && ratio <= 1.25),
    };
    const gates = {
      coldPool: evaluateSmokeGate(coldPool, ceilings.coldPool),
      warmGeneration: evaluateSmokeGate(
        warmGenerationSamples,
        ceilings.generationP95,
      ),
      encoding: evaluateSmokeGate(encoding, 5),
      fontResponse: evaluateSmokeGate(response, 5),
    };
    const result = {
      label,
      node: process.version,
      normalizedBytes,
      requestRepertoireCodepoints:
        requestFaces[0].permutationPlan.groups.reduce(
          (total, group) => total + group.values.length,
          0,
        ),
      coldPoolMilliseconds: stats(coldPool),
      coldPoolSamplesMs: coldPool.map((value) => Number(value.toFixed(3))),
      generationRuns,
      preparedPoolFillMilliseconds: requestMetrics.generationMilliseconds,
      encodingMilliseconds: stats(encoding),
      encodingSamplesMs: encoding.map((value) => Number(value.toFixed(3))),
      fontResponseMilliseconds: stats(response),
      fontResponseSamplesMs: response.map((value) => Number(value.toFixed(3))),
      ceilings,
      smokeGates: gates,
      capacityPrediction,
      pass:
        Object.values(gates).every((gate) => gate.pass) &&
        capacityPrediction.pass &&
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
