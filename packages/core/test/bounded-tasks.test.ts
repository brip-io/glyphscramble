import { describe, expect, it } from "vitest";
import { mapBounded, staticIoConcurrency } from "../src/bounded-tasks.js";

describe("bounded static tasks", () => {
  it("preserves result order while bounding active work", async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapBounded([30, 5, 20, 1], 2, async (delay, index) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active--;
      return index;
    });
    expect(result).toEqual([0, 1, 2, 3]);
    expect(maximum).toBe(2);
  });

  it("settles in-flight work and stops scheduling after a failure", async () => {
    let active = 0;
    let started = 0;
    let settled = 0;
    const operation = mapBounded(
      Array.from({ length: 10 }, (_, index) => index),
      3,
      async (index) => {
        started++;
        active++;
        try {
          await new Promise((resolve) =>
            setTimeout(resolve, index === 1 ? 5 : 20),
          );
          if (index === 1) throw new Error("injected I/O failure");
        } finally {
          active--;
          settled++;
        }
      },
    );
    await expect(operation).rejects.toThrow("injected I/O failure");
    expect(active).toBe(0);
    expect(started).toBe(3);
    expect(settled).toBe(3);
  });

  it("propagates an undefined rejection value", async () => {
    const operation = mapBounded([0], 1, async () => {
      throw undefined;
    });
    await expect(operation).rejects.toBeUndefined();
  });

  it("validates the documented static concurrency range", () => {
    expect(staticIoConcurrency(undefined)).toBe(8);
    expect(staticIoConcurrency(1)).toBe(1);
    expect(staticIoConcurrency(32)).toBe(32);
    for (const value of [0, 33, 1.5, Number.NaN])
      expect(() => staticIoConcurrency(value)).toThrow(/1 through 32/);
  });
});
