# [DX-COMPILER-SPIKE] Server component instrumentation feasibility

> Child of [DX-INSTRUMENTATION](DX-INSTRUMENTATION.md) — milestone **M5**.
>
> **Size:** M · **Priority:** P1 · **Status:** Deferred · **GitHub issue:** [#81](https://github.com/brip-io/glyphscramble/issues/81)
> **Blocked by:** DX-STATIC-BOUNDARY · **Blocks:** no beta release work

## Objective

Determine whether framework compiler instrumentation can make an explicitly annotated, source-owned server component graph feel like a transparent `GlyphBoundary` while still proving plaintext absence and hydration correctness.

## Research questions

- Can the framework transform every eligible literal and expression before HTML, RSC, hydration data, or client bundles are serialized?
- Can it trace source-owned child components across module boundaries and fail on third-party, dynamic, or otherwise opaque components?
- Can it prove a subtree is server-only and detect Client Components, islands, slots, suspense, streaming, and metadata side channels?
- Can it associate text with a known prepared face when typography changes across descendants?
- Can transformed builds retain source maps, diagnostics, incremental builds, and framework upgrades without excessive maintenance?

## Scope

- Prototype one explicitly annotated component graph in Next/React and one compiler-native template framework selected after static-boundary feedback.
- Cover direct text, prop-derived text, children/slots, async data, nested source components, opaque dependencies, and client boundaries.
- Produce build-time errors with file/component paths for unsupported graph edges.
- Measure build-time overhead, generated output, client runtime additions, and version coupling.
- Deliver a written go/no-go decision and, only on success, a separate implementation design per framework.

## Non-goals

- Shipping a supported compiler plugin from this issue.
- Instrumenting arbitrary third-party packages or runtime-created components.
- Using browser mutation as a fallback.
- Claiming one framework's result generalizes to the others.

## Testing strategy

- Seed unique plaintext canaries into every JSX/template, prop, serialization, metadata, source-map, and error path and scan all build/server outputs.
- Include deliberate client, third-party, dynamic-import, hydration, streaming, and mixed-typography violations and require closed build errors.
- Compare rendered output and framework hydration behavior in real production builds.
- Benchmark cold and incremental build cost and record the supported compiler/version envelope.

## Decision rule

Proceed only if the spike demonstrates complete graph closure for a useful server-only subset, zero plaintext in every qualified output, no hydration mismatch, actionable refusal of opaque edges, and acceptable maintenance/performance cost. Otherwise retain explicit `GlyphText`, static boundaries, and inert response boundaries as the supported APIs.

## Risks

- Compiler APIs and framework serialization formats change frequently.
- A partial transform is worse than no transform because it implies coverage while leaking through an unseen channel.
- Cross-module component analysis can become a bundler/compiler product larger than GlyphScramble itself.

## Exit criteria

The repository contains reproducible prototypes, leakage and hydration results, performance measurements, and an approved per-framework go/no-go record; no public support claim or production dependency is introduced by the spike.
