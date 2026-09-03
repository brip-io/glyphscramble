import { randomBytes } from "node:crypto";
import { availableParallelism } from "node:os";
import { assertTimerDelay, MAX_TIMER_DELAY_MS } from "./limits.js";
import { performance } from "node:perf_hooks";
import { buildSfnt, parseSfnt, remapCmap } from "./sfnt.js";
import {
  compactEncodeMapping,
  createPermutationFromPlan,
  type CodePointMapping,
  type Permutation,
  type PermutationPlan,
} from "./unicode.js";
import { Woff2WorkerPool } from "./worker-compressor.js";
import type {
  GlyphAcquisitionOptions,
  GlyphCapacityReport,
  GlyphDrainOptions,
  GlyphEngineMetrics,
  GlyphRuntimeEvent,
  GlyphRuntimeEventCode,
  GlyphRuntimeEventHandler,
} from "./types.js";

export const DEFAULT_VARIANT_RUNTIME = {
  poolLowWatermark: 2,
  poolHighWatermark: 4,
  generationConcurrency: 2,
  generationQueueLimit: 64,
  generationTimeoutMs: 10_000,
  acquisitionTimeoutMs: 50,
  acquisitionQueueLimit: 128,
  workerRecycleAfter: 256,
  drainTimeoutMs: 30_000,
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
  acquisitionTimeoutMs: number;
  acquisitionQueueLimit: number;
  workerRecycleAfter: number;
  drainTimeoutMs: number;
  cacheMaxBytes: number;
}

export interface FontVariantLease {
  readonly id: string;
  readonly seed: string;
}

export interface FontVariantProvider {
  start(): Promise<void>;
  acquire(expiresAt: number): FontVariantLease;
  acquireAsync(
    expiresAt: number,
    options?: GlyphAcquisitionOptions,
  ): Promise<FontVariantLease>;
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
  capacityReport(
    tokenTtlSeconds: number,
    targetResponsesPerSecond?: number,
  ): GlyphCapacityReport;
  drain(options?: GlyphDrainOptions): Promise<void>;
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

export class VariantDrainingError extends Error {
  constructor(message = "The font-variant provider is draining.") {
    super(message);
    this.name = "VariantDrainingError";
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
  acquisitionWaits: number;
  acquisitionTimeouts: number;
  acquisitionCancellations: number;
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
    timeout.unref?.();
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
  faces: ReadonlyMap<string, GeneratedVariantFace>;
  bytes: number;
  expiresAt?: number;
}

interface ExpiryEntry {
  id: string;
  expiresAt: number;
}

/** Ordered expiry index used by the provider and tested at high cardinality. */
export class OrderedExpiryIndex {
  readonly #heap: ExpiryEntry[] = [];

  get size(): number {
    return this.#heap.length;
  }

  peek(): Readonly<ExpiryEntry> | undefined {
    return this.#heap[0];
  }

  push(entry: ExpiryEntry): void {
    this.#heap.push(entry);
    let index = this.#heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.#before(this.#heap[index]!, this.#heap[parent]!)) break;
      [this.#heap[index], this.#heap[parent]] = [
        this.#heap[parent]!,
        this.#heap[index]!,
      ];
      index = parent;
    }
  }

  popExpired(now: number): ExpiryEntry[] {
    const expired: ExpiryEntry[] = [];
    while (this.#heap[0] && this.#heap[0].expiresAt <= now)
      expired.push(this.#pop()!);
    return expired;
  }

  clear(): void {
    this.#heap.length = 0;
  }

  #pop(): ExpiryEntry | undefined {
    const first = this.#heap[0];
    const last = this.#heap.pop();
    if (!first || !last || this.#heap.length === 0) return first;
    this.#heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let next = index;
      if (
        this.#heap[left] &&
        this.#before(this.#heap[left]!, this.#heap[next]!)
      )
        next = left;
      if (
        this.#heap[right] &&
        this.#before(this.#heap[right]!, this.#heap[next]!)
      )
        next = right;
      if (next === index) break;
      [this.#heap[index], this.#heap[next]] = [
        this.#heap[next]!,
        this.#heap[index]!,
      ];
      index = next;
    }
    return first;
  }

  #before(left: ExpiryEntry, right: ExpiryEntry): boolean {
    return (
      left.expiresAt < right.expiresAt ||
      (left.expiresAt === right.expiresAt && left.id < right.id)
    );
  }
}

interface AcquisitionWaiter {
  readonly expiresAt: number;
  readonly startedAt: number;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (lease: FontVariantLease) => void;
  readonly reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  onAbort: (() => void) | undefined;
}

export type VariantGenerator = (
  face: VariantFace,
  seed: string,
  signal: AbortSignal,
  permutation: Permutation,
) => Promise<Uint8Array>;

async function defaultGenerator(
  face: VariantFace,
  _seed: string,
  signal: AbortSignal,
  permutation: Permutation,
  workers: Woff2WorkerPool,
): Promise<Uint8Array> {
  const patched = buildSfnt(
    remapCmap(parseSfnt(face.sfnt), permutation.decode),
  );
  return workers.compress(patched, signal);
}

function randomId(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function compactMappingBytes(plan: PermutationPlan): number {
  const entries = plan.groups.reduce(
    (count, group) =>
      count + (group.values.length < 2 ? 0 : group.values.length),
    0,
  );
  let capacity = 2;
  while (capacity * 0.7 < entries) capacity *= 2;
  return capacity * Uint32Array.BYTES_PER_ELEMENT * 2;
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export class ResponsePoolVariantProvider implements FontVariantProvider {
  readonly #ready: Array<StoredVariant | undefined> = [];
  readonly #active = new Map<string, StoredVariant>();
  readonly #expiry = new OrderedExpiryIndex();
  readonly #waiters: AcquisitionWaiter[] = [];
  readonly #drainResolvers = new Set<() => void>();
  readonly #queue: BoundedGenerationQueue;
  readonly #workers: Woff2WorkerPool | undefined;
  readonly #generator: VariantGenerator;
  readonly #estimatedVariantBytes: number;
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
    acquisitionWaits: 0,
    acquisitionTimeouts: 0,
    acquisitionCancellations: 0,
    expiredVariants: 0,
    capacityDrops: 0,
    generationCount: 0,
    generationTotalMs: 0,
    generationMaxMs: 0,
    generationDurationsMs: [],
  };
  #readyHead = 0;
  #bytes = 0;
  #reservedBytes = 0;
  #generating = 0;
  #state: "running" | "draining" | "closed" = "running";
  #expiryTimer: ReturnType<typeof setTimeout> | undefined;
  #scheduledExpiry: number | undefined;
  #drainPromise: Promise<void> | undefined;
  #exhausted = false;
  #cachedGenerationStats:
    GlyphEngineMetrics["generationMilliseconds"] | undefined;
  #cachedGenerationCount = -1;

  constructor(
    private readonly faces: readonly VariantFace[],
    private readonly options: VariantProviderOptions,
    generator?: VariantGenerator,
    private readonly now: () => number = Date.now,
    private readonly onEvent?: GlyphRuntimeEventHandler,
  ) {
    if (faces.length === 0)
      throw new Error("A variant provider requires at least one font face.");
    for (const [name, value] of Object.entries(options)) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error(`Variant provider ${name} must be a positive integer.`);
    }
    for (const name of [
      "generationTimeoutMs",
      "acquisitionTimeoutMs",
      "drainTimeoutMs",
    ] as const)
      assertTimerDelay(options[name], `Variant provider ${name}`);
    if (options.poolLowWatermark > options.poolHighWatermark)
      throw new Error(
        "Variant provider poolLowWatermark must not exceed poolHighWatermark.",
      );
    this.#estimatedVariantBytes = faces.reduce(
      (total, face) =>
        total +
        face.sfnt.byteLength +
        compactMappingBytes(face.permutationPlan),
      0,
    );
    this.#queue = new BoundedGenerationQueue(
      options.generationConcurrency,
      options.generationQueueLimit,
      options.generationTimeoutMs,
      this.#counters,
    );
    if (generator) this.#generator = generator;
    else {
      this.#workers = new Woff2WorkerPool(
        options.generationConcurrency,
        options.workerRecycleAfter,
      );
      this.#generator = (face, seed, signal, permutation) =>
        defaultGenerator(face, seed, signal, permutation, this.#workers!);
    }
  }

  async start(): Promise<void> {
    if (this.#state !== "running")
      throw new VariantCancelledError("Provider cannot be restarted.");
    await this.#workers?.start();
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
    this.#assertRunning();
    this.#assertExpiry(expiresAt);
    this.#pruneExpired();
    const variant = this.#shiftReady();
    if (!variant) {
      this.#counters.poolExhaustions++;
      this.#exhausted = true;
      this.#emit("pool-exhausted");
      this.#scheduleRefill();
      throw new VariantUnavailableError();
    }
    return this.#lease(variant, expiresAt);
  }

  acquireAsync(
    expiresAt: number,
    acquisition: GlyphAcquisitionOptions = {},
  ): Promise<FontVariantLease> {
    const timeoutMs =
      acquisition.timeoutMs ?? this.options.acquisitionTimeoutMs;
    try {
      this.#assertRunning();
      this.#assertExpiry(expiresAt);
      assertTimerDelay(timeoutMs, "Variant acquisition timeout");
      this.#pruneExpired();
      const variant = this.#shiftReady();
      if (variant) return Promise.resolve(this.#lease(variant, expiresAt));
    } catch (error) {
      return Promise.reject(error);
    }
    if (acquisition.signal?.aborted) {
      this.#counters.acquisitionCancellations++;
      return Promise.reject(
        new VariantCancelledError("Variant acquisition was cancelled."),
      );
    }
    if (this.#waiters.length >= this.options.acquisitionQueueLimit) {
      this.#counters.poolExhaustions++;
      this.#exhausted = true;
      this.#emit("pool-exhausted");
      return Promise.reject(
        new VariantOverloadError("The response acquisition queue is full."),
      );
    }
    this.#counters.acquisitionWaits++;
    this.#exhausted = true;
    this.#emit("acquisition-wait");
    const result = new Promise<FontVariantLease>((resolve, reject) => {
      const waiter: AcquisitionWaiter = {
        expiresAt,
        startedAt: this.now(),
        signal: acquisition.signal,
        resolve,
        reject,
        timer: setTimeout(() => {
          if (!this.#removeWaiter(waiter)) return;
          this.#counters.poolExhaustions++;
          this.#counters.acquisitionTimeouts++;
          this.#emit("pool-exhausted", this.now() - waiter.startedAt);
          reject(
            new VariantUnavailableError(
              "No one-use font variant became ready before the acquisition deadline.",
            ),
          );
        }, timeoutMs),
        onAbort: undefined,
      };
      waiter.timer.unref?.();
      if (acquisition.signal) {
        waiter.onAbort = () => {
          if (!this.#removeWaiter(waiter)) return;
          this.#counters.acquisitionCancellations++;
          reject(
            new VariantCancelledError("Variant acquisition was cancelled."),
          );
        };
        acquisition.signal.addEventListener("abort", waiter.onAbort, {
          once: true,
        });
      }
      this.#waiters.push(waiter);
    });
    this.#scheduleRefill();
    return result;
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
      acquisitionWaits: this.#counters.acquisitionWaits,
      acquisitionTimeouts: this.#counters.acquisitionTimeouts,
      acquisitionCancellations: this.#counters.acquisitionCancellations,
      expiredVariants: this.#counters.expiredVariants,
      capacityDrops: this.#counters.capacityDrops,
      readyVariants: this.#readyCount(),
      activeVariants: this.#active.size,
      cacheBytes: this.#bytes,
      queueDepth: this.#queue.depth,
      activeGenerators: this.#queue.active,
      waitingRequests: this.#waiters.length,
      draining: this.#state === "draining",
      workerRestarts: this.#workers?.restarts ?? 0,
      estimatedVariantBytes: this.#estimatedVariantBytes,
      generationMilliseconds: this.#generationStats(),
    };
  }

  capacityReport(
    tokenTtlSeconds: number,
    targetResponsesPerSecond?: number,
  ): GlyphCapacityReport {
    if (!Number.isFinite(tokenTtlSeconds) || tokenTtlSeconds <= 0)
      throw new TypeError("Token TTL must be a positive number.");
    if (
      targetResponsesPerSecond !== undefined &&
      (!Number.isFinite(targetResponsesPerSecond) ||
        targetResponsesPerSecond <= 0)
    )
      throw new TypeError("Target response rate must be a positive number.");
    const p95 = this.#generationStats().p95;
    const sustainable =
      p95 === 0
        ? 0
        : (this.options.generationConcurrency * 1000) /
          (p95 * this.faces.length);
    const perTtl = sustainable * tokenTtlSeconds;
    const cacheLimited = Math.floor(
      this.options.cacheMaxBytes / this.#estimatedVariantBytes,
    );
    const estimatedBytes = Math.ceil(
      (perTtl + this.options.poolHighWatermark) * this.#estimatedVariantBytes,
    );
    const targetVariants =
      targetResponsesPerSecond === undefined
        ? undefined
        : targetResponsesPerSecond * tokenTtlSeconds;
    const guidance: string[] = [];
    if (p95 === 0)
      guidance.push(
        "Run glyphscramble benchmark before sizing production traffic.",
      );
    if (this.options.generationConcurrency > availableParallelism())
      guidance.push(
        "runtime.generationConcurrency exceeds the host parallelism; benchmark a lower worker count to avoid CPU contention.",
      );
    if (cacheLimited < this.options.poolLowWatermark)
      guidance.push(
        "Increase runtime.cacheMaxBytes or reduce the prepared face set.",
      );
    if (perTtl > cacheLimited)
      guidance.push(
        "The measured generation rate can outpace retained-token cache capacity.",
      );
    if (
      targetResponsesPerSecond !== undefined &&
      targetResponsesPerSecond > sustainable
    )
      guidance.push(
        "The target rate exceeds measured generation capacity; add CPU or reduce face cost.",
      );
    if (
      targetVariants !== undefined &&
      targetVariants + this.options.poolHighWatermark > cacheLimited
    )
      guidance.push(
        "The target rate and token TTL exceed the configured cache capacity.",
      );
    if (guidance.length === 0)
      guidance.push(
        "Measured generation and retained-byte capacity fit the requested envelope.",
      );
    return {
      faceCount: this.faces.length,
      hostParallelism: availableParallelism(),
      generationConcurrency: this.options.generationConcurrency,
      readyBurst: this.options.poolHighWatermark,
      cacheMaxBytes: this.options.cacheMaxBytes,
      estimatedVariantBytes: this.#estimatedVariantBytes,
      cacheLimitedResponses: cacheLimited,
      tokenTtlSeconds,
      measuredFaceGenerationP95Ms: p95,
      sustainableResponsesPerSecond: Number(sustainable.toFixed(3)),
      sustainableResponsesPerTtl: Number(perTtl.toFixed(3)),
      estimatedBytesAtSustainableRate: estimatedBytes,
      ...(targetResponsesPerSecond === undefined
        ? {}
        : {
            targetResponsesPerSecond,
            targetFitsGeneration: targetResponsesPerSecond <= sustainable,
            targetFitsCache:
              targetVariants! + this.options.poolHighWatermark <= cacheLimited,
          }),
      guidance: Object.freeze(guidance),
    };
  }

  drain(options: GlyphDrainOptions = {}): Promise<void> {
    if (this.#state === "closed") return Promise.resolve();
    if (this.#drainPromise) return this.#drainPromise;
    const timeoutMs = options.timeoutMs ?? this.options.drainTimeoutMs;
    try {
      assertTimerDelay(timeoutMs, "Variant drain timeout");
    } catch (error) {
      return Promise.reject(error);
    }
    const startedAt = this.now();
    this.#state = "draining";
    this.#emit("drain-started");
    this.#rejectWaiters(new VariantDrainingError());
    this.#clearReady();
    this.#drainPromise = (async () => {
      await this.#queue.close();
      await this.#workers?.close();
      await this.#waitForActive(timeoutMs, options.signal);
      await this.#finishClose();
      this.#emit("drain-complete", this.now() - startedAt);
    })();
    return this.#drainPromise;
  }

  async close(): Promise<void> {
    if (this.#state === "closed") return;
    this.#state = "closed";
    this.#rejectWaiters(new VariantCancelledError("Provider is closed."));
    await this.#queue.close();
    await this.#workers?.close();
    await this.#finishClose();
  }

  async #generateAndStore(required: boolean): Promise<boolean> {
    if (this.#state !== "running") return false;
    if (
      this.#bytes + this.#reservedBytes + this.#estimatedVariantBytes >
      this.options.cacheMaxBytes
    ) {
      this.#counters.capacityDrops++;
      if (required)
        throw new Error(
          "runtime.cacheMaxBytes cannot hold the configured ready variants and active token lifetime.",
        );
      return false;
    }
    this.#reservedBytes += this.#estimatedVariantBytes;
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
              const font = await this.#generator(
                face,
                seed,
                signal,
                permutation,
              );
              const mapping = compactEncodeMapping(permutation.encode);
              this.#recordGeneration(performance.now() - started);
              return { font, mapping };
            });
            return [face.id, generated] as const;
          } catch (error) {
            this.#counters.generationFailures++;
            this.#emit(
              error instanceof VariantTimeoutError
                ? "generation-timeout"
                : "generation-failed",
              undefined,
              errorClass(error),
            );
            throw error;
          }
        }),
      );
      const bytes = outputs.reduce(
        (total, item) =>
          total + item[1].font.length + item[1].mapping.byteLength,
        0,
      );
      if (this.#state !== "running") return false;
      this.#pruneExpired();
      if (this.#bytes + bytes > this.options.cacheMaxBytes) {
        this.#counters.capacityDrops++;
        if (required)
          throw new Error(
            "runtime.cacheMaxBytes cannot hold the configured ready variants and active token lifetime.",
          );
        return false;
      }
      const variant = {
        id,
        seed,
        faces: new Map(outputs),
        bytes,
      } satisfies StoredVariant;
      this.#bytes += bytes;
      if (!this.#serveWaiter(variant)) this.#ready.push(variant);
      this.#emit("pool-depth");
      return true;
    } catch (error) {
      if (required) throw error;
      return false;
    } finally {
      this.#reservedBytes -= this.#estimatedVariantBytes;
    }
  }

  #scheduleRefill(): void {
    if (this.#state !== "running") return;
    this.#pruneExpired();
    while (
      this.#readyCount() + this.#generating <
      this.options.poolHighWatermark
    ) {
      this.#generating++;
      void this.#generateAndStore(false).then((stored) => {
        this.#generating--;
        if (stored) this.#scheduleRefill();
      });
    }
  }

  #lease(variant: StoredVariant, expiresAt: number): FontVariantLease {
    this.#assertExpiry(expiresAt);
    variant.expiresAt = expiresAt;
    this.#active.set(variant.id, variant);
    this.#expiry.push({ id: variant.id, expiresAt });
    this.#counters.leasesIssued++;
    if (this.#exhausted) {
      this.#exhausted = false;
      this.#emit("pool-recovered");
    }
    this.#scheduleExpiryMaintenance();
    this.#scheduleRefill();
    this.#emit("pool-depth");
    return Object.freeze({ id: variant.id, seed: variant.seed });
  }

  #serveWaiter(variant: StoredVariant): boolean {
    while (this.#waiters.length > 0) {
      const waiter = this.#waiters.shift()!;
      this.#clearWaiter(waiter);
      if (waiter.signal?.aborted) {
        this.#counters.acquisitionCancellations++;
        waiter.reject(
          new VariantCancelledError("Variant acquisition was cancelled."),
        );
        continue;
      }
      try {
        const lease = this.#lease(variant, waiter.expiresAt);
        this.#emit("acquisition-wait", this.now() - waiter.startedAt);
        waiter.resolve(lease);
        return true;
      } catch (error) {
        waiter.reject(error);
      }
    }
    return false;
  }

  #shiftReady(): StoredVariant | undefined {
    const variant = this.#ready[this.#readyHead];
    if (!variant) return undefined;
    this.#ready[this.#readyHead++] = undefined;
    if (this.#readyHead >= 64 && this.#readyHead * 2 >= this.#ready.length) {
      this.#ready.splice(0, this.#readyHead);
      this.#readyHead = 0;
    }
    return variant;
  }

  #readyCount(): number {
    return this.#ready.length - this.#readyHead;
  }

  #clearReady(): void {
    for (let index = this.#readyHead; index < this.#ready.length; index++)
      this.#bytes -= this.#ready[index]!.bytes;
    this.#ready.length = 0;
    this.#readyHead = 0;
  }

  #pruneExpired(): void {
    const expired = this.#expiry.popExpired(this.now());
    for (const entry of expired) {
      const variant = this.#active.get(entry.id);
      if (!variant || variant.expiresAt !== entry.expiresAt) continue;
      this.#active.delete(entry.id);
      this.#bytes -= variant.bytes;
      this.#counters.expiredVariants++;
      this.#emit("variant-expired");
    }
    if (expired.length > 0) this.#notifyDrained();
  }

  #mapping(
    variantId: string,
    faceId: string,
    expectedSeed: string,
  ): CodePointMapping | undefined {
    this.#pruneExpired();
    const variant = this.#active.get(variantId);
    this.#scheduleExpiryMaintenance();
    return variant?.seed === expectedSeed
      ? variant.faces.get(faceId)?.mapping
      : undefined;
  }

  #scheduleExpiryMaintenance(): void {
    if (this.#state === "closed") return;
    const nextExpiry = this.#expiry.peek()?.expiresAt;
    if (nextExpiry === this.#scheduledExpiry && this.#expiryTimer) return;
    if (this.#expiryTimer) clearTimeout(this.#expiryTimer);
    this.#expiryTimer = undefined;
    this.#scheduledExpiry = nextExpiry;
    if (nextExpiry === undefined) return;
    const delay = Math.min(
      MAX_TIMER_DELAY_MS,
      Math.max(1, nextExpiry - this.now()),
    );
    assertTimerDelay(delay, "Variant expiry maintenance delay");
    this.#expiryTimer = setTimeout(() => {
      this.#expiryTimer = undefined;
      this.#scheduledExpiry = undefined;
      this.#pruneExpired();
      this.#scheduleRefill();
      this.#scheduleExpiryMaintenance();
    }, delay);
    this.#expiryTimer.unref?.();
  }

  #removeWaiter(waiter: AcquisitionWaiter): boolean {
    const index = this.#waiters.indexOf(waiter);
    if (index < 0) return false;
    this.#waiters.splice(index, 1);
    this.#clearWaiter(waiter);
    return true;
  }

  #clearWaiter(waiter: AcquisitionWaiter): void {
    clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort)
      waiter.signal.removeEventListener("abort", waiter.onAbort);
  }

  #rejectWaiters(error: Error): void {
    for (const waiter of this.#waiters.splice(0)) {
      this.#clearWaiter(waiter);
      waiter.reject(error);
    }
  }

  #assertRunning(): void {
    if (this.#state === "draining") throw new VariantDrainingError();
    if (this.#state === "closed")
      throw new VariantCancelledError("Provider is closed.");
  }

  #assertExpiry(expiresAt: number): void {
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now())
      throw new TypeError("Variant expiry must be in the future.");
    assertTimerDelay(Math.ceil(expiresAt - this.now()), "Variant expiry delay");
  }

  async #waitForActive(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    this.#pruneExpired();
    if (this.#active.size === 0) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", finish);
        this.#drainResolvers.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      timer.unref?.();
      this.#drainResolvers.add(finish);
      signal?.addEventListener("abort", finish, { once: true });
      if (signal?.aborted) finish();
    });
  }

  #notifyDrained(): void {
    if (this.#active.size !== 0) return;
    for (const resolve of this.#drainResolvers) resolve();
    this.#drainResolvers.clear();
  }

  async #finishClose(): Promise<void> {
    this.#state = "closed";
    if (this.#expiryTimer) clearTimeout(this.#expiryTimer);
    this.#expiryTimer = undefined;
    this.#scheduledExpiry = undefined;
    this.#clearReady();
    this.#active.clear();
    this.#expiry.clear();
    this.#bytes = 0;
    this.#reservedBytes = 0;
    this.#notifyDrained();
  }

  #recordGeneration(duration: number): void {
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
  }

  #generationStats(): GlyphEngineMetrics["generationMilliseconds"] {
    if (
      this.#cachedGenerationStats &&
      this.#cachedGenerationCount === this.#counters.generationCount
    )
      return this.#cachedGenerationStats;
    this.#cachedGenerationCount = this.#counters.generationCount;
    this.#cachedGenerationStats = Object.freeze({
      count: this.#counters.generationCount,
      total: Number(this.#counters.generationTotalMs.toFixed(3)),
      max: Number(this.#counters.generationMaxMs.toFixed(3)),
      p50: percentile(this.#counters.generationDurationsMs, 0.5),
      p95: percentile(this.#counters.generationDurationsMs, 0.95),
      p99: percentile(this.#counters.generationDurationsMs, 0.99),
      samples: Object.freeze(
        this.#counters.generationDurationsMs.map((value) =>
          Number(value.toFixed(3)),
        ),
      ),
    });
    return this.#cachedGenerationStats;
  }

  #emit(
    code: GlyphRuntimeEventCode,
    durationMs?: number,
    eventErrorClass?: string,
  ): void {
    if (!this.onEvent) return;
    const event: GlyphRuntimeEvent = Object.freeze({
      code,
      timestamp: this.now(),
      readyVariants: this.#readyCount(),
      activeVariants: this.#active.size,
      queueDepth: this.#queue.depth,
      waitingRequests: this.#waiters.length,
      ...(durationMs === undefined
        ? {}
        : { durationMs: Number(durationMs.toFixed(3)) }),
      ...(eventErrorClass === undefined ? {} : { errorClass: eventErrorClass }),
    });
    try {
      this.onEvent(event);
    } catch {
      // Operator callbacks cannot affect protection or expose request data.
    }
  }
}

export function variantRuntimeOptions(
  runtime: {
    poolLowWatermark?: number;
    poolHighWatermark?: number;
    generationConcurrency?: number;
    generationQueueLimit?: number;
    generationTimeoutMs?: number;
    acquisitionTimeoutMs?: number;
    acquisitionQueueLimit?: number;
    workerRecycleAfter?: number;
    drainTimeoutMs?: number;
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
    acquisitionTimeoutMs:
      runtime.acquisitionTimeoutMs ??
      DEFAULT_VARIANT_RUNTIME.acquisitionTimeoutMs,
    acquisitionQueueLimit:
      runtime.acquisitionQueueLimit ??
      DEFAULT_VARIANT_RUNTIME.acquisitionQueueLimit,
    workerRecycleAfter:
      runtime.workerRecycleAfter ?? DEFAULT_VARIANT_RUNTIME.workerRecycleAfter,
    drainTimeoutMs:
      runtime.drainTimeoutMs ?? DEFAULT_VARIANT_RUNTIME.drainTimeoutMs,
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
