export const DEFAULT_STATIC_IO_CONCURRENCY = 8;
export const MAX_STATIC_IO_CONCURRENCY = 32;

export function staticIoConcurrency(value: number | undefined): number {
  const concurrency = value ?? DEFAULT_STATIC_IO_CONCURRENCY;
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_STATIC_IO_CONCURRENCY
  )
    throw new Error(
      `Static I/O concurrency must be an integer from 1 through ${MAX_STATIC_IO_CONCURRENCY}.`,
    );
  return concurrency;
}

/**
 * Maps in input order with bounded concurrency. Workers stop taking new work
 * after the first failure, then all in-flight work settles before rejection so
 * callers can safely remove a staging tree.
 */
export async function mapBounded<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = cursor++;
      if (index >= values.length) return;
      try {
        results[index] = await mapper(values[index]!, index);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () =>
      worker(),
    ),
  );
  if (failed) throw failure;
  return results;
}
