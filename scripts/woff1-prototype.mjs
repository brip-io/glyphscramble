import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  buildSfnt,
  createPermutationFromPlan,
  createPermutationPlan,
  inspectFont,
  parseSfnt,
  remapCmap,
} from "../packages/core/dist/index.js";
import { toWoff2 } from "../packages/core/dist/font-pipeline.js";
import {
  buildPrototypeWoff1,
  createPrototypeTableCache,
} from "../packages/core/dist/woff1-prototype.js";

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (quantile) =>
    Number(
      sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)
      ].toFixed(3),
    );
  return { p50: at(0.5), p95: at(0.95) };
}

async function main() {
  const require = createRequire(
    new URL("../packages/core/package.json", import.meta.url),
  );
  const sourcePath =
    require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
  const prepared = await inspectFont(
    new Uint8Array(await readFile(sourcePath)),
    "inter-latin-variable",
  );
  const original = parseSfnt(prepared.sfnt);
  const plan = createPermutationPlan(prepared.metadata.codepoints);
  const cache = createPrototypeTableCache(original);
  const cachedMs = [];
  const uncachedMs = [];
  const woff2Ms = [];
  const cachedBytes = [];
  const woff2Bytes = [];
  for (let index = 0; index < 5; index++) {
    const permutation = createPermutationFromPlan(
      plan,
      Buffer.alloc(32, index + 1).toString("base64url"),
      "woff1-prototype",
    );
    const patched = parseSfnt(
      buildSfnt(remapCmap(original, permutation.decode)),
    );
    let started = performance.now();
    const cached = buildPrototypeWoff1(patched, cache);
    cachedMs.push(performance.now() - started);
    parseSfnt(cached);
    cachedBytes.push(cached.length);

    started = performance.now();
    buildPrototypeWoff1(patched);
    uncachedMs.push(performance.now() - started);

    started = performance.now();
    const woff2 = await toWoff2(patched);
    woff2Ms.push(performance.now() - started);
    woff2Bytes.push(woff2.length);
  }
  const average = (values) =>
    values.reduce((total, value) => total + value, 0) / values.length;
  const cachedAverage = average(cachedBytes);
  const woff2Average = average(woff2Bytes);
  process.stdout.write(
    `${JSON.stringify(
      {
        fixture: "@fontsource-variable/inter latin variable 5.3.0",
        normalizedBytes: prepared.sfnt.length,
        variants: 5,
        immutableTablesCached: cache.size,
        totalTables: original.tables.size,
        generationMilliseconds: {
          woff1Cached: stats(cachedMs),
          woff1Uncached: stats(uncachedMs),
          woff2: stats(woff2Ms),
        },
        transferBytes: {
          woff1Average: Math.round(cachedAverage),
          woff2Average: Math.round(woff2Average),
          woff1IncreasePercent: Number(
            (((cachedAverage - woff2Average) / woff2Average) * 100).toFixed(1),
          ),
        },
        decision: "reject-for-v0.1",
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
