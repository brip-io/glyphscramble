/* global process, Request, URL */

import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  buildSfnt,
  buildStaticSite,
  compactEncodeMapping,
  createGlyphEngine,
  createPermutation,
  defineGlyphConfig,
  loadPreparedFont,
  parseSfnt,
  prepareGlyphFonts,
  remapCmap,
} from "../../../packages/core/dist/index.js";
import { toWoff2 } from "../../../packages/core/dist/font-pipeline.js";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const publicDir = join(appRoot, "public/demo-fixtures");
const generatedFile = join(appRoot, "src/generated/demo-fixtures.json");
const sentence = "Independent research deserves deliberate access.";
const demoSecret = "public-demo-secret-not-for-production-use-2026-09";

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function deterministicSeed(label) {
  return createHash("sha256").update(label).digest("base64url");
}

function deterministicVariantId(label) {
  return createHash("sha256")
    .update(label)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

function metrics() {
  return {
    variantMode: "response-pool",
    leasesIssued: 0,
    poolExhaustions: 0,
    fontHits: 0,
    fontMisses: 0,
    generations: 0,
    generationFailures: 0,
    generationTimeouts: 0,
    generationCancellations: 0,
    generationOverloads: 0,
    acquisitionWaits: 0,
    acquisitionTimeouts: 0,
    acquisitionCancellations: 0,
    expiredVariants: 0,
    capacityDrops: 0,
    readyVariants: 2,
    activeVariants: 0,
    cacheBytes: 0,
    queueDepth: 0,
    activeGenerators: 0,
    waitingRequests: 0,
    draining: false,
    workerRestarts: 0,
    estimatedVariantBytes: 0,
    generationMilliseconds: {
      count: 0,
      total: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      samples: [],
    },
  };
}

async function runtimeFixtures(config, cwd) {
  const prepared = await loadPreparedFont("body", cwd);
  const faceId = `${prepared.id}@${prepared.faceId}`;
  const namespace = `${faceId}:${prepared.metadata.identity}`;
  const leases = [
    {
      id: deterministicVariantId("glyphscramble-public-demo-response-a"),
      seed: deterministicSeed("glyphscramble-public-demo-response-a"),
    },
    {
      id: deterministicVariantId("glyphscramble-public-demo-response-b"),
      seed: deterministicSeed("glyphscramble-public-demo-response-b"),
    },
  ];
  const fonts = new Map();
  const mappings = new Map();

  for (const lease of leases) {
    const permutation = createPermutation(
      prepared.metadata.codepoints,
      lease.seed,
      namespace,
    );
    const patched = buildSfnt(
      remapCmap(parseSfnt(prepared.sfnt), permutation.decode),
    );
    mappings.set(lease.id, compactEncodeMapping(permutation.encode));
    fonts.set(lease.id, await toWoff2(parseSfnt(patched)));
  }

  let nextLease = 0;
  const provider = {
    async start() {},
    acquire() {
      const lease = leases[nextLease++];
      if (!lease) throw new Error("Demo variant pool exhausted.");
      return lease;
    },
    async acquireAsync() {
      return provider.acquire();
    },
    mapping(lease, requestedFace) {
      const knownLease = leases.find((item) => item.id === lease.id);
      if (
        !knownLease ||
        knownLease.seed !== lease.seed ||
        requestedFace !== faceId
      )
        return undefined;
      return mappings.get(lease.id);
    },
    font(variantId, requestedFace, expectedSeed) {
      const lease = leases.find((item) => item.id === variantId);
      if (!lease || lease.seed !== expectedSeed || requestedFace !== faceId)
        return undefined;
      return fonts.get(variantId);
    },
    metrics,
    capacityReport(tokenTtlSeconds, targetResponsesPerSecond) {
      return {
        faceCount: 1,
        hostParallelism: 1,
        generationConcurrency: 1,
        readyBurst: leases.length,
        cacheMaxBytes: 0,
        estimatedVariantBytes: 0,
        cacheLimitedResponses: leases.length,
        tokenTtlSeconds,
        measuredFaceGenerationP95Ms: 0,
        sustainableResponsesPerSecond: leases.length,
        sustainableResponsesPerTtl: leases.length * tokenTtlSeconds,
        estimatedBytesAtSustainableRate: 0,
        ...(targetResponsesPerSecond === undefined
          ? {}
          : {
              targetResponsesPerSecond,
              targetFitsGeneration: true,
              targetFitsCache: true,
            }),
        guidance: [],
      };
    },
    async drain() {},
    async close() {},
  };

  process.env.GLYPHSCRAMBLE_DEMO_SECRET = demoSecret;
  const engine = await createGlyphEngine(config, {
    cwd,
    variantProvider: provider,
    now: () => Date.UTC(2026, 8, 3, 12, 0, 0),
  });

  try {
    const output = {};
    for (const [index, key] of ["a", "b"].entries()) {
      const context = engine.beginResponse();
      const payload = context.scramble(sentence, { font: "body", lang: "en" });
      const response = await engine.fontResponse(
        new Request(`https://glyphscramble.demo${payload.fontUrl}`),
      );
      if (!response.ok)
        throw new Error(
          `Demo font response ${key} failed with ${response.status}.`,
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = `/demo-fixtures/runtime-${key}.woff2`;
      await writeFile(join(publicDir, `runtime-${key}.woff2`), bytes);
      output[key] = {
        id: `runtime-${key}`,
        label: `Response ${key.toUpperCase()}`,
        encodedText: payload.encodedText,
        family: `GlyphScrambleDemo-runtime-${key}`,
        fontFile: file,
        fontIdentity: sha256(bytes),
        token: "response token (redacted)",
        fontUrl: "/_glyphscramble/font/[token]/body%40default.woff2",
        documentCache: "private, no-store",
        fontCache:
          response.headers.get("cache-control") ?? "private, immutable",
      };
      if (index === 0 && payload.encodedText === sentence) {
        throw new Error(
          "Runtime demo fixture did not encode the source sentence.",
        );
      }
    }
    return output;
  } finally {
    await engine.close();
    delete process.env.GLYPHSCRAMBLE_DEMO_SECRET;
  }
}

async function staticFixture(config, cwd, key) {
  const sourceDir = join(cwd, `static-source-${key}`);
  const outputDir = join(cwd, `static-output-${key}`);
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"></head><body><article data-glyphscramble-font="body">${sentence}</article></body></html>`,
  );
  const result = await buildStaticSite(config, {
    cwd,
    inputDir: sourceDir,
    outputDir,
    seed: deterministicSeed(`glyphscramble-public-static-${key}`),
    publicBasePath: "/",
  });
  const html = await readFile(join(outputDir, "index.html"), "utf8");
  const encodedText = html.match(/<article[^>]*>([^<]+)<\/article>/u)?.[1];
  const family = html.match(/data-glyphscramble-family="([^"]+)"/u)?.[1];
  const fontAsset = result.manifest.assets.find(
    (asset) => asset.kind === "font",
  );
  if (!encodedText || !family || !fontAsset)
    throw new Error(`Static demo fixture ${key} is incomplete.`);
  const destination = `static-${key}.woff2`;
  await copyFile(join(outputDir, fontAsset.path), join(publicDir, destination));
  return {
    id: `static-${key}`,
    label: `Build ${key.toUpperCase()}`,
    encodedText,
    family,
    fontFile: `/demo-fixtures/${destination}`,
    fontIdentity: fontAsset.sha256,
    fontUrl: `/${fontAsset.path}`,
    documentCache: "public, revalidate",
    fontCache: "public, immutable",
    buildId: result.manifest.buildId,
  };
}

async function main() {
  const scratch = await mkdtemp(join(tmpdir(), "glyphscramble-site-fixtures-"));
  await mkdir(join(scratch, "licenses"), { recursive: true });
  await mkdir(publicDir, { recursive: true });
  await mkdir(dirname(generatedFile), { recursive: true });
  await writeFile(
    join(scratch, "licenses/OFL.txt"),
    "Inter fixture font. SIL Open Font License 1.1. https://openfontlicense.org\n",
  );

  try {
    const require = createRequire(join(repoRoot, "packages/core/package.json"));
    const fontPath =
      require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
    const config = defineGlyphConfig({
      fonts: {
        body: {
          source: { kind: "file", path: fontPath },
          license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
          coverage: ["U+0020-007E"],
        },
      },
      rotation: {
        scope: "response",
        keyId: "public-demo",
        secretEnv: "GLYPHSCRAMBLE_DEMO_SECRET",
        tokenTtlSeconds: 600,
      },
      routePrefix: "/_glyphscramble",
      unsupported: "error",
      accessibilityRiskAcknowledged: true,
    });

    await prepareGlyphFonts(config, { cwd: scratch });
    const runtime = await runtimeFixtures(config, scratch);
    const staticA = await staticFixture(config, scratch, "a");
    const staticB = await staticFixture(config, scratch, "b");
    const fixtures = {
      sentence,
      generatedWith: "@brip/glyphscramble 0.1.0-beta.0",
      runtime,
      static: { a: staticA, b: staticB },
    };
    await writeFile(generatedFile, `${JSON.stringify(fixtures, null, 2)}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

await main();
