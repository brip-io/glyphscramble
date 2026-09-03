export interface SmokeGateResult {
  readonly pass: boolean;
  readonly sampleCount: number;
  readonly failures: number;
  readonly allowedOutliers: number;
  readonly ceilingMs: number;
}

/**
 * CI smoke policy: tolerate one isolated scheduler outlier (or 5% for larger
 * sets), but fail when the regression is sustained across independent samples.
 */
export function evaluateSmokeGate(
  samples: readonly number[],
  ceilingMs: number,
): SmokeGateResult {
  if (samples.length === 0) throw new Error("A smoke gate requires samples.");
  if (!Number.isFinite(ceilingMs) || ceilingMs <= 0)
    throw new Error("A smoke-gate ceiling must be positive.");
  if (samples.some((sample) => !Number.isFinite(sample) || sample < 0))
    throw new Error("Smoke-gate samples must be finite non-negative numbers.");
  const allowedOutliers = Math.max(1, Math.floor(samples.length * 0.05));
  const failures = samples.filter((sample) => sample >= ceilingMs).length;
  return Object.freeze({
    pass: failures <= allowedOutliers,
    sampleCount: samples.length,
    failures,
    allowedOutliers,
    ceilingMs,
  });
}
