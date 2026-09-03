import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { buildSfnt, parseSfnt, remapCmap } from "./sfnt.js";
import {
  compactEncodeMapping,
  createPermutationFromPlan,
  type CodePointMapping,
  type Permutation,
  type PermutationPlan,
} from "./unicode.js";
import { compressWoff2InWorker } from "./worker-compressor.js";
import type { GlyphEngineMetrics } from "./types.js";

export const DEFAULT_VARIANT_RUNTIME = {
  poolLowWatermark: 2,
  poolHighWatermark: 4,
  generationConcurrency: 2,
  generationQueueLimit: 64,
  generationTimeoutMs: 10_000,
  cacheMaxBytes: 64 * 1024 * 1024,
} as const;

export interface VariantFace {
  /** Configured family and face id, for example `body@regular`. */
  id: string;
  namespace: string;
  sfnt: Uint8Array;
  permutationPlan: PermutationPlan;
}

export interface VariantProviderOptions {
  poolLowWatermark: number;
  poolHighWatermark: number;
  generationConcurrency: number;
  generationQueueLimit: number;
  generationTimeoutMs: number;
  cacheMaxBytes: number;
}

export interface FontVariantLease {
  readonly id: string;
  readonly seed: string;
}

export interface FontVariantProvider {
  start(): Promise<void>;
  acquire(expiresAt: number): FontVariantLease;
  /** Server-only mapping boundary used by the request engine. */
  mapping(
    lease: FontVariantLease,
    faceId: string,
  ): CodePointMapping | undefined;
  font(
    variantId: string,
    faceId: string,
    expectedSeed: string,
  ): Uint8Array | undefined;
  metrics(): GlyphEngineMetrics;
  close(): Promise<void>;
}

export class VariantUnavailableError extends Error {
  constructor(message = "No one-use font variant is ready.") {
    super(message);
    this.name = "VariantUnavailableError";
  }
}

export class VariantOverloadError extends Error {
  constructor(message = "The font-generation queue is full.") {
    super(message);
    this.name = "VariantOverloadError";
  }
}

export class VariantTimeoutError extends Error {
  constructor(message = "Font generation exceeded its deadline.") {
    super(message);
    this.name = "VariantTimeoutError";
  }
}

export class VariantCancelledError extends Error {
  constructor(message = "Font generation was cancelled.") {
    super(message);
    this.name = "VariantCancelledError";
  }
}

interface MutableMetrics {
  leasesIssued: number;
  poolExhaustions: number;
  fontHits: number;
  fontMisses: number;
  generations: number;
  generationFailures: number;
  generationTimeouts: number;
  generationCancellations: number;
  generationOverloads: number;
  expiredVariants: number;
  capacityDrops: number;
  generationCount: number;
  generationTotalMs: number;
  generationMaxMs: number;
  generationDurationsMs: number[];
}

interface GeneratedVariantFace {
  font: Uint8Array;
  mapping: CodePointMapping;
}

type GenerationTask = (signal: AbortSignal) => Promise<GeneratedVariantFace>;

interface QueueItem {
  task: GenerationTask;
  resolve(value: GeneratedVariantFace): void;
  reject(error: unknown): void;
}

class BoundedGenerationQueue {
  readonly #pending: QueueItem[] = [];
  readonly #controllers = new Set<AbortController>();
  readonly #idleResolvers = new Set<() => void>();
  #active = 0;
  #closed = false;

  constructor(
    private readonly concurrency: number,
    private readonly queueLimit: number,
    private readonly timeoutMs: number,
    private readonly counters: MutableMetrics,
  ) {}

  get depth(): number {
    return this.#pending.length;
  }

  get active(): number {
    return this.#active;
  }

  run(task: GenerationTask): Promise<GeneratedVariantFace> {
    if (this.#closed)
      return Promise.reject(new VariantCancelledError("Provider is closed."));
    if (
      this.#active >= this.concurrency &&
      this.#pending.length >= this.queueLimit
    ) {
      this.counters.generationOverloads++;
      return Promise.reject(new VariantOverloadError());
    }
    const result = new Promise<GeneratedVariantFace>((resolve, reject) => {
      this.#pending.push({ task, resolve, reject });
    });
    this.#drain();
    return result;
  }

  #drain(): void {
    while (
      !this.#closed &&
      this.#active < this.concurrency &&
      this.#pending.length > 0
    ) {
      const item = this.#pending.shift()!;
      this.#start(item);
    }
  }

  #start(item: QueueItem): void {
    this.#active++;
    const controller = new AbortController();
    this.#controllers.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const cancelled = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () =>
          reject(
            timedOut ? new VariantTimeoutError() : new VariantCancelledError(),
          ),
        { once: true },
      );
    });

    const task = new Promise<void>((resolve) => setImmediate(resolve)).then(
      () => {
        if (controller.signal.aborted) throw new VariantCancelledError();
        return item.task(controller.signal);
      },
    );
    Promise.race([task, cancelled])
      .then(item.resolve)
      .catch((error: unknown) => {
        if (timedOut) {
          this.counters.generationTimeouts++;
          item.reject(error);
        } else if (controller.signal.aborted) {
          this.counters.generationCancellations++;
          item.reject(error);
        } else item.reject(error);
      })
      .finally(() => {
        clearTimeout(timeout);
        this.#controllers.delete(controller);
        this.#active--;
        this.#drain();
        if (this.#active === 0 && this.#pending.length === 0) {
          for (const resolve of this.#idleResolvers) resolve();
          this.#idleResolvers.clear();
        }
      });
  }

  async close(): Promise<void> {
    if (this.#closed && this.#active === 0) return;
    this.#closed = true;
    for (const item of this.#pending.splice(0)) {
      this.counters.generationCancellations++;
      item.reject(
        new VariantCancelledError("Provider closed before generation."),
      );
    }
    for (const controller of this.#controllers) controller.abort();
    if (this.#active > 0)
      await new Promise<void>((resolve) => this.#idleResolvers.add(resolve));
  }
}

interface StoredVariant {
  id: string;
  seed: string;
  faces: ReadonlyMap<
    string,
    {
      font: Uint8Array;
      mapping: CodePointMapping;
    }
  >;
  bytes: number;
  expiresAt?: number;
}

export type VariantGenerator = (
  face: VariantFace,
  seed: string,
  signal: AbortSignal,
  permutation: Permutation,
) => Promise<Uint8Array>;

async function defaultGenerator(
  face: VariantFace,
  seed: string,
  signal: AbortSignal,
  permutation: Permutation,
): Promise<Uint8Array> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (signal.aborted) throw new VariantCancelledError();
  const patched = buildSfnt(
    remapCmap(parseSfnt(face.sfnt), permutation.decode),
  );
  return compressWoff2InWorker(patched, signal);
}

function randomId(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export class ResponsePoolVariantProvider implements FontVariantProvider {
  readonly #ready: StoredVariant[] = [];
  readonly #active = new Map<string, StoredVariant>();
  readonly #queue: BoundedGenerationQueue;
  readonly #counters: MutableMetrics = {
    leasesIssued: 0,
    poolExhaustions: 0,
    fontHits: 0,
    fontMisses: 0,
    generations: 0,
    generationFailures: 0,
    generationTimeouts: 0,
    generationCancellations: 0,
    generationOverloads: 0,
    expiredVariants: 0,
    capacityDrops: 0,
    generationCount: 0,
    generationTotalMs: 0,
    generationMaxMs: 0,
    generationDurationsMs: [],
  };
  #bytes = 0;
  #generating = 0;
  #closed = false;
  #expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly faces: readonly VariantFace[],
    private readonly options: VariantProviderOptions,
    private readonly generator: VariantGenerator = defaultGenerator,
    private readonly now: () => number = Date.now,
  ) {
    if (faces.length === 0)
      throw new Error("A variant provider requires at least one font face.");
    for (const [name, value] of Object.entries(options)) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error(`Variant provider ${name} must be a positive integer.`);
    }
    if (options.poolLowWatermark > options.poolHighWatermark)
      throw new Error(
        "Variant provider poolLowWatermark must not exceed poolHighWatermark.",
      );
    this.#queue = new BoundedGenerationQueue(
      options.generationConcurrency,
      options.generationQueueLimit,
      options.generationTimeoutMs,
      this.#counters,
    );
  }

  async start(): Promise<void> {
    const results = await Promise.all(
      Array.from({ length: this.options.poolLowWatermark }, () =>
        this.#generateAndStore(true),
      ),
    );
    if (results.some((stored) => !stored))
      throw new Error(
        "runtime.cacheMaxBytes cannot hold the configured poolLowWatermark.",
      );
    this.#scheduleRefill();
  }

  acquire(expiresAt: number): FontVariantLease {
    this.#pruneExpired();
    const variant = this.#ready.shift();
    if (!variant) {
      this.#counters.poolExhaustions++;
      this.#scheduleRefill();
      throw new VariantUnavailableError();
    }
    variant.expiresAt = expiresAt;
    this.#active.set(variant.id, variant);
    this.#counters.leasesIssued++;
    this.#scheduleExpiryMaintenance();
    this.#scheduleRefill();
    const variantId = variant.id;
    const variantSeed = variant.seed;
    return Object.freeze({
      id: variantId,
      seed: variantSeed,
    });
  }

  mapping(
    lease: FontVariantLease,
    faceId: string,
  ): CodePointMapping | undefined {
    return this.#mapping(lease.id, faceId, lease.seed);
  }

  font(
    variantId: string,
    faceId: string,
    expectedSeed: string,
  ): Uint8Array | undefined {
    this.#pruneExpired();
    const variant = this.#active.get(variantId);
    const output =
      variant?.seed === expectedSeed
        ? variant.faces.get(faceId)?.font
        : undefined;
    if (output) this.#counters.fontHits++;
    else this.#counters.fontMisses++;
    this.#scheduleExpiryMaintenance();
    return output;
  }

  metrics(): GlyphEngineMetrics {
    return {
      variantMode: "response-pool",
      leasesIssued: this.#counters.leasesIssued,
      poolExhaustions: this.#counters.poolExhaustions,
      fontHits: this.#counters.fontHits,
      fontMisses: this.#counters.fontMisses,
      generations: this.#counters.generations,
      generationFailures: this.#counters.generationFailures,
      generationTimeouts: this.#counters.generationTimeouts,
      generationCancellations: this.#counters.generationCancellations,
      generationOverloads: this.#counters.generationOverloads,
      expiredVariants: this.#counters.expiredVariants,
      capacityDrops: this.#counters.capacityDrops,
      readyVariants: this.#ready.length,
      activeVariants: this.#active.size,
      cacheBytes: this.#bytes,
      queueDepth: this.#queue.depth,
      activeGenerators: this.#queue.active,
      generationMilliseconds: {
        count: this.#counters.generationCount,
        total: Number(this.#counters.generationTotalMs.toFixed(3)),
        max: Number(this.#counters.generationMaxMs.toFixed(3)),
        p50: percentile(this.#counters.generationDurationsMs, 0.5),
        p95: percentile(this.#counters.generationDurationsMs, 0.95),
        p99: percentile(this.#counters.generationDurationsMs, 0.99),
      },
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#expiryTimer) clearTimeout(this.#expiryTimer);
    await this.#queue.close();
    this.#ready.length = 0;
    this.#active.clear();
    this.#bytes = 0;
  }

  async #generateAndStore(required: boolean): Promise<boolean> {
    if (this.#closed) return false;
    const id = randomId(16);
    const seed = randomId(32);
    try {
      const outputs = await Promise.all(
        this.faces.map(async (face) => {
          try {
            const generated = await this.#queue.run(async (signal) => {
              const started = performance.now();
              const permutation = createPermutationFromPlan(
                face.permutationPlan,
                seed,
                face.namespace,
              );
              const font = await this.generator(
                face,
                seed,
                signal,
                permutation,
              );
              const mapping = compactEncodeMapping(permutation.encode);
              const duration = performance.now() - started;
              this.#counters.generations++;
              this.#counters.generationCount++;
              this.#counters.generationTotalMs += duration;
              this.#counters.generationMaxMs = Math.max(
                this.#counters.generationMaxMs,
                duration,
              );
              if (this.#counters.generationDurationsMs.length === 256)
                this.#counters.generationDurationsMs.shift();
              this.#counters.generationDurationsMs.push(duration);
              return { font, mapping };
            });
            return [face.id, generated] as const;
          } catch (error) {
            this.#counters.generationFailures++;
            throw error;
          }
        }),
      );
      const bytes = outputs.reduce(
        (total, item) =>
          total + item[1].font.length + item[1].mapping.byteLength,
        0,
      );
      if (this.#closed) return false;
      this.#pruneExpired();
      if (this.#bytes + bytes > this.options.cacheMaxBytes) {
        this.#counters.capacityDrops++;
        if (required)
          throw new Error(
            "runtime.cacheMaxBytes cannot hold the configured ready variants and active token lifetime.",
          );
        return false;
      }
      this.#ready.push({
        id,
        seed,
        faces: new Map(outputs),
        bytes,
      });
      this.#bytes += bytes;
      return true;
    } catch (error) {
      if (required) throw error;
      return false;
    }
  }

  #scheduleRefill(): void {
    if (this.#closed) return;
    this.#pruneExpired();
    while (
      this.#ready.length + this.#generating <
      this.options.poolHighWatermark
    ) {
      this.#generating++;
      void this.#generateAndStore(false).then((stored) => {
        this.#generating--;
        if (stored) this.#scheduleRefill();
      });
    }
  }

  #pruneExpired(): void {
    const now = this.now();
    for (const [id, variant] of this.#active) {
      if (variant.expiresAt === undefined || variant.expiresAt > now) continue;
      this.#active.delete(id);
      this.#bytes -= variant.bytes;
      this.#counters.expiredVariants++;
    }
  }

  #mapping(
    variantId: string,
    faceId: string,
    expectedSeed: string,
  ): CodePointMapping | undefined {
    this.#pruneExpired();
    const variant = this.#active.get(variantId);
    return variant?.seed === expectedSeed
      ? variant.faces.get(faceId)?.mapping
      : undefined;
  }

  #scheduleExpiryMaintenance(): void {
    if (this.#closed) return;
    if (this.#expiryTimer) clearTimeout(this.#expiryTimer);
    const nextExpiry = [...this.#active.values()].reduce(
      (earliest, variant) =>
        variant.expiresAt === undefined
          ? earliest
          : Math.min(earliest, variant.expiresAt),
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(nextExpiry)) {
      this.#expiryTimer = undefined;
      return;
    }
    this.#expiryTimer = setTimeout(
      () => {
        this.#expiryTimer = undefined;
        this.#pruneExpired();
        this.#scheduleRefill();
        this.#scheduleExpiryMaintenance();
      },
      Math.min(2_147_483_647, Math.max(1, nextExpiry - this.now())),
    );
    this.#expiryTimer.unref?.();
  }
}

export function variantRuntimeOptions(
  runtime: {
    poolLowWatermark?: number;
    poolHighWatermark?: number;
    generationConcurrency?: number;
    generationQueueLimit?: number;
    generationTimeoutMs?: number;
    cacheMaxBytes?: number;
  } = {},
): VariantProviderOptions {
  return {
    poolLowWatermark:
      runtime.poolLowWatermark ?? DEFAULT_VARIANT_RUNTIME.poolLowWatermark,
    poolHighWatermark:
      runtime.poolHighWatermark ?? DEFAULT_VARIANT_RUNTIME.poolHighWatermark,
    generationConcurrency:
      runtime.generationConcurrency ??
      DEFAULT_VARIANT_RUNTIME.generationConcurrency,
    generationQueueLimit:
      runtime.generationQueueLimit ??
      DEFAULT_VARIANT_RUNTIME.generationQueueLimit,
    generationTimeoutMs:
      runtime.generationTimeoutMs ??
      DEFAULT_VARIANT_RUNTIME.generationTimeoutMs,
    cacheMaxBytes:
      runtime.cacheMaxBytes ?? DEFAULT_VARIANT_RUNTIME.cacheMaxBytes,
  };
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * quantile) - 1,
  );
  return Number(sorted[index]!.toFixed(3));
}
