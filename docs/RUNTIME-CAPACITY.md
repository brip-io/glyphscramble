# Runtime capacity and shutdown

Per-response protection spends CPU before demand and retains one font mapping
until its token expires. Capacity therefore depends on the prepared face set,
measured generation time, worker concurrency, response rate, token TTL, ready
burst, and retained-byte ceiling. It is not a universal requests-per-second
claim.

## Bounded acquisition

Use the async path at the server-only plaintext boundary:

```ts
const context = engine.beginResponse({ signal: request.signal });
const payload = await context.scrambleAsync(value, { font: "body" });
```

The context consumes nothing until the first protected call. If no ready
variant exists, `scrambleAsync()` waits in a FIFO queue for at most
`runtime.acquisitionTimeoutMs` (50 ms by default). The queue accepts at most
`runtime.acquisitionQueueLimit` waiters (128 by default), propagates an abort
signal, and fails closed on timeout or overload. `scramble()` remains the
explicit immediate path: it never waits and throws when the ready pool is empty.
Neither path returns plaintext on failure.

## Defaults and sizing

```ts
runtime: {
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
}
```

`engine.capacityReport(targetResponsesPerSecond?)` uses measured per-face p95
generation time and reports:

- logical CPU parallelism visible to the process and the configured worker
  concurrency, with an oversubscription warning;
- sustainable response variants per second as
  `generationConcurrency × 1000 / (faceCount × faceGenerationP95Ms)`;
- a conservative variant-byte estimate based on normalized face bytes plus the
  retained mapping tables;
- the number of response variants that fit in `cacheMaxBytes`;
- bytes required for the measured rate across the token TTL plus the ready
  burst; and
- whether an optional target rate fits both generation and cache bounds.

The estimate intentionally reserves normalized font size before generation.
Actual WOFF2 and mapping bytes are reconciled afterward. Work that cannot fit is
rejected before compression; an unexpectedly larger result is dropped rather
than evicting a still-valid token.

Run both commands on hardware representative of production:

```bash
npm exec glyphscramble -- benchmark --target-rps 10
npm exec glyphscramble -- doctor --capacity --target-rps 10
```

The benchmark prints bounded raw timing samples plus p50/p95/p99 summaries.
CI smoke gates tolerate one isolated scheduler outlier (or five percent of a
larger sample) but fail sustained regressions. The 123 KB and padded 1 MB smoke
fixtures also compare measured finite-pool fill throughput with the p95 model;
the reviewed 0.50-1.25 ratio accounts for worker startup and the partially
filled final concurrency wave. R12 still owns controlled-hardware release
qualification; shared-runner results are not an SLA.

## Events

Pass `onEvent` to `createGlyphEngine()` to receive aggregate events for pool
depth, acquisition waits/exhaustion/recovery, generation failure/timeout,
expiry, and drain. Events contain only timestamps, durations, error classes,
and aggregate counts. They never contain text, tokens, seeds, mappings, face
names, or variant IDs. Callback failures are isolated from protection.

## Graceful drain

Stop accepting application traffic, then await:

```ts
await engine.drain({ timeoutMs: 30_000 });
```

Drain rejects new leases and queued waiters, stops generation, discards unused
ready variants, and continues serving fonts already authorized by live tokens.
It completes when those variants expire or when the bounded deadline is
reached. At the deadline the process releases remaining state, so a browser
still holding an older token receives the documented fail-closed response.

For rolling deployments, remove the instance from the load balancer before
drain, keep its font route reachable during the drain window, and choose a
deadline appropriate for the configured token TTL. Process-local state still
requires request affinity: R17 improves drain behavior but does not make a font
issued by one process available in another.
