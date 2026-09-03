import { describe, expect, it } from "vitest";
import { evaluateSmokeGate } from "../src/benchmark-policy.js";

describe("runtime benchmark smoke policy", () => {
  it("does not fail a healthy series for one scheduler outlier", () => {
    expect(evaluateSmokeGate([4, 4, 40], 10)).toMatchObject({
      pass: true,
      failures: 1,
      allowedOutliers: 1,
    });
  });

  it("fails a sustained regression", () => {
    expect(evaluateSmokeGate([4, 12, 14], 10)).toMatchObject({
      pass: false,
      failures: 2,
      allowedOutliers: 1,
    });
  });

  it("uses a bounded five-percent allowance for larger samples", () => {
    const samples = Array.from({ length: 100 }, () => 4);
    samples.splice(0, 6, 20, 20, 20, 20, 20, 20);
    expect(evaluateSmokeGate(samples, 10)).toMatchObject({
      pass: false,
      failures: 6,
      allowedOutliers: 5,
    });
  });
});
