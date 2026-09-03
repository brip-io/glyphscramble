import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

// Resolve from the deployed dependency graph rather than relative to this
// module: Astro and Next may relocate the compiled server chunk. Reflect keeps
// framework compilers from replacing require.resolve() with a numeric module
// id, which is not a filesystem location accepted by worker_threads.
const requireFromBundle = createRequire(import.meta.url);
const resolveFromBundle = Reflect.get(
  requireFromBundle,
  "resolve",
) as NodeJS.RequireResolve;
const WORKER_LOCATION = Reflect.apply(resolveFromBundle, requireFromBundle, [
  "@brip/glyphscramble/woff2-worker",
]) as string;

function abortError(): Error {
  const error = new Error("WOFF2 generation was cancelled.");
  error.name = "AbortError";
  return error;
}

interface ActiveJob {
  signal: AbortSignal;
  onAbort: () => void;
  resolve(value: Uint8Array): void;
  reject(error: unknown): void;
}

interface WorkerSlot {
  readonly index: number;
  readonly worker: Worker;
  jobs: number;
  active: ActiveJob | undefined;
}

interface AvailabilityWaiter {
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

/**
 * Persistent, fixed-size WOFF2 worker pool. The outer generation queue owns
 * admission; this class owns WASM reuse, crash replacement, and cancellation.
 */
export class Woff2WorkerPool {
  readonly #slots: Array<WorkerSlot | undefined>;
  readonly #maintenance = new Set<Promise<void>>();
  #closed = false;
  #started = false;
  #restarts = 0;
  readonly #availabilityWaiters = new Set<AvailabilityWaiter>();

  constructor(
    size: number,
    private readonly recycleAfter = 256,
    private readonly workerLocation: string | URL = WORKER_LOCATION,
  ) {
    if (!Number.isSafeInteger(size) || size < 1)
      throw new TypeError("WOFF2 worker-pool size must be a positive integer.");
    if (!Number.isSafeInteger(recycleAfter) || recycleAfter < 1)
      throw new TypeError(
        "WOFF2 worker recycle threshold must be a positive integer.",
      );
    this.#slots = Array.from({ length: size });
  }

  get restarts(): number {
    return this.#restarts;
  }

  async start(): Promise<void> {
    if (this.#started) return;
    if (this.#closed) throw abortError();
    this.#started = true;
    try {
      await Promise.all(
        this.#slots.map((_slot, index) => this.#spawn(index, false)),
      );
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async compress(input: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
    if (this.#closed || signal.aborted) return Promise.reject(abortError());
    if (!this.#started)
      return Promise.reject(new Error("WOFF2 worker pool has not started."));

    let slot: WorkerSlot | undefined;
    while (!slot) {
      slot = this.#slots.find((candidate) => candidate && !candidate.active);
      if (!slot) await this.#waitForAvailability(signal);
      if (this.#closed || signal.aborted) throw abortError();
    }

    const transferable = input.slice().buffer;
    return new Promise<Uint8Array>((resolve, reject) => {
      const onAbort = () => this.#trackMaintenance(this.#cancel(slot));
      slot.active = { signal, onAbort, resolve, reject };
      signal.addEventListener("abort", onAbort, { once: true });
      slot.worker.postMessage({ input: transferable }, [transferable]);
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#availabilityWaiters) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.reject(abortError());
    }
    this.#availabilityWaiters.clear();
    await Promise.all(
      this.#slots.map(async (slot, index) => {
        if (!slot) return;
        this.#slots[index] = undefined;
        const active = slot.active;
        if (active) {
          active.signal.removeEventListener("abort", active.onAbort);
          active.reject(abortError());
          slot.active = undefined;
        }
        slot.worker.removeAllListeners();
        await slot.worker.terminate();
      }),
    );
    await Promise.allSettled([...this.#maintenance]);
  }

  async #spawn(index: number, replacement: boolean): Promise<void> {
    if (this.#closed) return;
    const worker = new Worker(this.workerLocation);
    const slot: WorkerSlot = { index, worker, jobs: 0, active: undefined };
    this.#slots[index] = slot;
    worker.on("message", (message: { output?: ArrayBuffer; error?: string }) =>
      this.#trackMaintenance(this.#message(slot, message)),
    );
    worker.on("error", (error) =>
      this.#trackMaintenance(this.#crash(slot, error)),
    );
    worker.on("exit", (code) => {
      if (!this.#closed && this.#slots[index] === slot && code !== 0)
        this.#trackMaintenance(
          this.#crash(
            slot,
            new Error(`WOFF2 worker exited with status ${code}.`),
          ),
        );
    });
    await new Promise<void>((resolve, reject) => {
      worker.once("online", resolve);
      worker.once("error", reject);
    });
    if (replacement) this.#restarts++;
    this.#notifyAvailability();
  }

  async #message(
    slot: WorkerSlot,
    message: { output?: ArrayBuffer; error?: string },
  ): Promise<void> {
    if (this.#slots[slot.index] !== slot || !slot.active) return;
    const active = slot.active;
    active.signal.removeEventListener("abort", active.onAbort);
    slot.jobs++;
    if (message.error) {
      slot.active = undefined;
      this.#notifyAvailability();
      active.reject(new Error(`WOFF2 worker failed: ${message.error}`));
      return;
    }
    if (!message.output) {
      slot.active = undefined;
      this.#notifyAvailability();
      active.reject(new Error("WOFF2 worker returned no output."));
      return;
    }
    const output = new Uint8Array(message.output);
    try {
      if (slot.jobs >= this.recycleAfter) await this.#replace(slot);
      else {
        slot.active = undefined;
        this.#notifyAvailability();
      }
      active.resolve(output);
    } catch (error) {
      active.reject(error);
    }
  }

  async #cancel(slot: WorkerSlot): Promise<void> {
    if (this.#slots[slot.index] !== slot || !slot.active) return;
    const active = slot.active;
    active.signal.removeEventListener("abort", active.onAbort);
    try {
      await this.#replace(slot);
    } finally {
      active.reject(abortError());
    }
  }

  async #crash(slot: WorkerSlot, error: Error): Promise<void> {
    if (this.#slots[slot.index] !== slot) return;
    const active = slot.active;
    if (active) active.signal.removeEventListener("abort", active.onAbort);
    try {
      await this.#replace(slot);
    } finally {
      active?.reject(error);
    }
  }

  async #replace(slot: WorkerSlot): Promise<void> {
    if (this.#slots[slot.index] !== slot) return;
    this.#slots[slot.index] = undefined;
    slot.worker.removeAllListeners();
    await slot.worker.terminate();
    if (!this.#closed) await this.#spawn(slot.index, true);
  }

  #waitForAvailability(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<void>((resolve, reject) => {
      const waiter: AvailabilityWaiter = {
        signal,
        onAbort: () => {
          this.#availabilityWaiters.delete(waiter);
          reject(abortError());
        },
        resolve: () => {
          signal.removeEventListener("abort", waiter.onAbort);
          resolve();
        },
        reject,
      };
      this.#availabilityWaiters.add(waiter);
      signal.addEventListener("abort", waiter.onAbort, { once: true });
    });
  }

  #notifyAvailability(): void {
    for (const waiter of this.#availabilityWaiters) {
      this.#availabilityWaiters.delete(waiter);
      waiter.resolve();
    }
  }

  #trackMaintenance(operation: Promise<void>): void {
    this.#maintenance.add(operation);
    operation.then(
      () => this.#maintenance.delete(operation),
      () => this.#maintenance.delete(operation),
    );
  }
}

/** One-shot compatibility helper; runtime providers should reuse a pool. */
export async function compressWoff2InWorker(
  input: Uint8Array,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const pool = new Woff2WorkerPool(1, 1);
  await pool.start();
  try {
    return await pool.compress(input, signal);
  } finally {
    await pool.close();
  }
}
