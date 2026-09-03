import { describe, expect, it } from "vitest";
import { Woff2WorkerPool } from "../src/worker-compressor.js";

const fixture = new URL("./fixtures/reusable-worker.mjs", import.meta.url);

describe("persistent WOFF2 worker pool", () => {
  it("reuses workers, recycles at the configured bound, and closes", async () => {
    const pool = new Woff2WorkerPool(1, 2, fixture);
    await pool.start();
    await expect(
      pool.compress(new Uint8Array([1, 2]), new AbortController().signal),
    ).resolves.toEqual(new Uint8Array([1, 2]));
    expect(pool.restarts).toBe(0);
    await expect(
      pool.compress(new Uint8Array([3, 4]), new AbortController().signal),
    ).resolves.toEqual(new Uint8Array([3, 4]));
    expect(pool.restarts).toBe(1);
    await pool.close();
    await expect(
      pool.compress(new Uint8Array([5]), new AbortController().signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("replaces crashed and cancelled workers before admitting more work", async () => {
    const pool = new Woff2WorkerPool(1, 100, fixture);
    await pool.start();
    await expect(
      pool.compress(new Uint8Array([0xff]), new AbortController().signal),
    ).rejects.toThrow(/status 1/);
    expect(pool.restarts).toBe(1);
    await expect(
      pool.compress(new Uint8Array([7]), new AbortController().signal),
    ).resolves.toEqual(new Uint8Array([7]));

    const controller = new AbortController();
    const cancelled = pool.compress(new Uint8Array([0xfe]), controller.signal);
    const recovered = pool.compress(
      new Uint8Array([8]),
      new AbortController().signal,
    );
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(pool.restarts).toBe(2);
    await expect(recovered).resolves.toEqual(new Uint8Array([8]));
    await pool.close();
  });
});
