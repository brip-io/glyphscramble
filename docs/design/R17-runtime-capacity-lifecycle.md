# [R17] Runtime capacity, lifecycle, and observability

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P0 · **Status:** Implemented in [PR #47](https://github.com/brip-io/glyphscramble/pull/47) · **GitHub issue:** [#34](https://github.com/brip-io/glyphscramble/issues/34)
> **Blocked by:** R16 · **Blocks:** R12 performance and reliability qualification

## Objective

Turn the one-use variant pool from a bounded burst buffer into an operable runtime with measurable throughput, bounded waits, scalable expiry, reusable workers, graceful drain, and content-safe diagnostics.

## Background

The 2026-09-03 review measured WOFF2 generation at roughly 430 ms for a 123 KB face and 2.2–2.4 s for a padded 1 MB face locally, approximately twice as slow on shared CI. Two generators therefore sustain only a few Latin responses per second and less than one large-face response per second. Exhaustion throws during page rendering. `acquire()` and `font()` scan the active map and re-arm expiry timers on every call; each compression spawns a worker; capacity is checked only after generation; non-required generation failures increment a counter without an operator event. The shared-runner 10 ms acquisition p95 gate is also marginal and has repeatedly left `main` red despite documentation-only changes.

As immediate containment, CI runs the existing strict benchmark on every push
to `main` and on pull requests that change core/runtime inputs; documentation-
only pull requests no longer retry a timing gate they cannot affect. This does
not alter the ceiling or replace the stable methodology required here.

## Goals

- Express capacity as sustainable response rate, burst size, latency, CPU, and memory.
- Wait briefly for imminent variants without allowing unbounded render latency.
- Keep request lookup and expiry logarithmic or constant-time at high active counts.
- Reuse compression workers and reject impossible work before spending CPU.
- Support rolling deploy drain while valid font tokens remain serviceable.
- Emit structured operational events without content, seeds, mappings, or tokens.

## Non-goals

- Silently reusing mappings across responses.
- Promising throughput independent of font size, face count, CPU, or encoder.
- Making CI shared runners the sole source of production capacity claims.

## Requirements

1. The provider MUST expose an async bounded acquisition path with configurable maximum wait and cancellation; timeout/overload MUST remain fail-closed.
2. A persistent worker pool MUST be sized to generation concurrency and shut down deterministically.
3. Expiry MUST use a min-heap or equivalent ordered structure; `font()` MUST not scan all active variants or reset an unchanged timer.
4. Estimated retained bytes MUST be checked before enqueue/generation and reconciled with actual bytes afterward.
5. Derived token keys, prepared lockfiles, family loads, and metric percentile work MUST avoid repeated request/startup computation where safe.
6. Structured events MUST cover pool depth, wait, exhaustion, generation failure/timeout, expiry, drain, and recovery without content-sensitive fields.
7. Graceful drain MUST stop new leases while serving already issued fonts for their remaining TTL, with a bounded shutdown deadline.
8. `benchmark` and `doctor` MUST report sustainable-rate estimates and configuration guidance tied to measured face cost and CPU concurrency.
9. CI smoke gates MUST use robust margins/statistics; strict performance qualification MUST run in the R12 controlled matrix and publish raw samples.
10. A documented WOFF 1.0 prototype MUST measure cached-table reuse, generation latency, transfer-size increase, browser support, and operational simplification before the final WOFF2-only decision.

## Design

Separate ready, leased, and expiring indexes. A FIFO waiter queue receives the next generated variant up to a small deadline; queue bounds and abort signals prevent request pileups. Waiting begins lazily on the first `scrambleAsync()` call so merely creating an unused response context never consumes a one-use variant. The existing synchronous `scramble()` remains the explicit fail-fast path. One timer tracks the heap's earliest expiry and changes only when that minimum changes. Persistent workers initialize the WASM encoder once and receive transferable buffers.

A capacity report combines measured generation rate, configured concurrency, face count, low/high watermarks, TTL-retained memory, and target traffic. An `onEvent` callback receives typed codes, timestamps, durations, counts, and error classes only. Drain is an explicit engine state.

## Scope and deliverables

- Async provider/engine acquisition API and adapter integration.
- Persistent worker pool, expiry heap, preflight byte accounting, and startup/load optimizations.
- Typed diagnostics hook and graceful-drain API/runbook.
- Capacity calculator in `doctor`/`benchmark` and deployment guidance.
- WOFF 1.0 per-table-reuse prototype with recorded accept/reject decision.
- High-cardinality, overload, recovery, shutdown, benchmark, and leak tests.

## Testing strategy

- Fake-clock tests cover heap order, one-timer behavior, token TTL, drain, and cleanup.
- Concurrency tests prove bounded wait rescues imminent work but rejects beyond queue/deadline limits.
- Worker tests prove reuse, crash replacement, cancellation, no eval in published code, and deterministic closure.
- A 12k-active-variant fixture detects whole-map request scans.
- Capacity tests compare predicted and measured throughput within reviewed tolerance for 123 KB and 1 MB faces.
- Benchmark gate mutation tests prove noisy single outliers do not fail a healthy build and sustained regressions do.

## Risks

- Waiting can convert immediate overload into latency amplification; deadlines and queue limits stay small and explicit.
- Worker reuse can retain WASM memory; recycling thresholds and shutdown tests are required.
- WOFF 1.0 increases transfer size; it ships only if measured operational gains outweigh that cost.

## Dependencies

- R16 supplies low-cost retained mappings and accurate generation/request metric separation.
- R07-R10 must await the async acquisition boundary without plaintext fallback.
- R12 qualifies controlled performance, overload, rolling deploy, and release gates.

## Exit criteria

The runtime sustains its documented rate, absorbs bounded near-ready waits, performs no active-map scans on ordinary requests, reuses and closes workers, rejects impossible work before compression, exposes content-safe diagnostics, drains without invalidating live fonts prematurely, and produces stable CI inputs for controlled R12 performance qualification.

## Implementation evidence

- [PR #47](https://github.com/brip-io/glyphscramble/pull/47) adds lazy
  `scrambleAsync()` acquisition with FIFO queue, timeout, cancellation, and
  queue bounds. Existing `scramble()` remains the explicit immediate
  fail-closed path, and an unused response context consumes no variant.
- `ResponsePoolVariantProvider` now separates ready, active, and ordered expiry
  indexes; `font()` is a direct map lookup and one timer follows only the
  heap's earliest expiry. A 12,000-entry ordered-index fixture and a regression
  for unchanged timer scheduling pin those properties.
- The provider reserves a conservative normalized-font-plus-mapping estimate
  before queueing compression and reconciles actual retained bytes afterward.
  Prepared families and their lockfile load once per engine startup, and
  generation percentiles are cached until the bounded raw sample set changes.
- A fixed-size `Woff2WorkerPool` reuses file-backed workers, transfers font
  buffers, replaces crashed or cancelled workers before admitting dependent
  work, recycles them at a configured job count, and closes outstanding
  maintenance deterministically.
- `onEvent`, `metrics()`, `capacityReport()`, `doctor --capacity`, and
  `benchmark --target-rps` expose aggregate operational evidence without text,
  mappings, tokens, seeds, variant IDs, or face names. Host parallelism and
  worker oversubscription are included in capacity guidance.
- `engine.drain()` rejects new leases and waiters, stops generation, and serves
  issued fonts until expiry or a bounded deadline. Astro, Nuxt, and SvelteKit
  propagate request aborts, the Next wrapper awaits the bounded async path, and
  server examples drain on shutdown.
- Runtime benchmark fixtures publish raw samples and compare p95-model capacity
  with measured finite-pool throughput for 123 KB and padded 1 MB faces. The
  smoke policy tolerates an isolated scheduler outlier but fails sustained
  regression; R12 still owns controlled release qualification.
- The reproducible WOFF 1.0 table-cache prototype reused 19 of 21 Inter tables
  and loaded in Chromium, Firefox, and WebKit, but produced fonts 23.4% larger
  than WOFF2. The reviewed v0.1 decision is therefore to retain WOFF2 and its
  persistent worker pool.

## Review record

R17 closes review findings P3, P4, P5, P10, and D7, and operationally mitigates
P2 and U1 without weakening their fail-closed boundary. It also closes the
shared-runner methodology portion of P12. Process-local variants still require
request affinity or an external provider; R12 owns controlled-hardware,
multi-instance, and release qualification.
