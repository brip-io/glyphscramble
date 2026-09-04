# [R10] Astro 7, Vite, and vanilla integration

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #41](https://github.com/brip-io/glyphscramble/pull/41), corrected by [PR #42](https://github.com/brip-io/glyphscramble/pull/42) · **GitHub issue:** [#11](https://github.com/brip-io/glyphscramble/issues/11)
> **Blocked by:** R02, R03, R05, R06 · **Blocks:** R12

## Objective

Deliver a typed Astro SSR integration, a functional Vite static plugin with honest non-hydrated constraints, and complete generic Fetch/Node server examples.

## Background

The Astro component is excluded from Astro typechecking and embeds one unhandled inline loader per component. The Vite initializer writes `glyphscramble.vite.ts` but does not register it in `vite.config`, while the plugin expects `dist-unprotected`, which ordinary Vite builds do not create. Static React/Vue/Svelte claims exceed the HTML-only compiler boundary. The generic API exposes Fetch primitives but no complete Node adapter example.

## Goals

- Use actual Astro middleware/component contracts and R06 lifecycle.
- Make the Vite plugin participate in a normal build and derive paths from resolved config.
- Reject hydrated static boundaries from R02.
- Provide framework-neutral Fetch and Node reference integrations.

## Non-goals

- Claiming per-response rotation for Vite static output.
- Protecting arbitrary SPA state or client-fetched APIs.
- Supporting every Node web framework in v0.1.

## Requirements

1. Astro middleware/components MUST compile with `astro check` against the declared peer version.
2. Astro SSR MUST use one locals context and selective R05 headers.
3. The Astro component MUST delegate loading, timeout, failure, and cleanup to R06 without one global scan per block.
4. Astro static use MUST reject protected client islands/hydrated descendants.
5. The Vite plugin MUST be a real `Plugin`, read `ResolvedConfig`, transform a fresh build output, and be added to the user's `plugins` array by documented/init-supported steps.
6. The plugin MUST never use the protected output as its next input.
7. Static output MUST consume R02/R03 and always emit a per-build downgrade notice.
8. Generic Fetch and Node examples MUST show request-context ownership, font routing, selective cache headers, streaming limits, and shutdown.
9. Real Astro and Vite fixtures MUST build and run in CI.
10. Astro's lazy `ReadableStream` rendering MUST be tested explicitly. The adapter MUST either buffer with a documented ceiling/cost or require route-scoped protection so `private, no-store` is committed before protected bytes.
11. Astro and vanilla surfaces MUST expose the shared R18 timeout and localized generic-error options.

## Design

Astro publishes middleware typed with the official API and a component that invokes a small shared R06 module once per node with teardown. Static mode operates after Astro build only on R02-approved non-hydrated markers.

The Vite plugin captures `outDir`, `base`, and build mode during `configResolved`; it either stages Vite output into a separate protected directory or performs R02's atomic publish flow. The initializer patches a simple `vite.config` only when syntax is safely recognized, otherwise prints an exact manual snippet and exits nonzero/incomplete.

### Streaming and publication decisions

Astro defaults to bounded buffering because `next()` returning a `Response`
does not prove that lazy component or endpoint rendering has completed. The
adapter consumes at most 2 MiB before inspecting `ResponseContext.used`; an
overflow fails before any body escapes. Publishers that need streaming opt into
an explicit route predicate. Unmatched routes receive no response context,
while matched routes commit protected headers before `next()`.

The Astro component is a versioned custom element. Native connect/disconnect
callbacks own one shared R06 mount handle per block, including timeout,
localized generic error, and teardown. The package itself runs `astro check`.

Vite's config hook redirects its normal fresh output to a private staging tree.
`configResolved` supplies the project root, base, SSR flag, and final paths;
`writeBundle` proves output was emitted; `closeBundle` invokes the transactional
R02/R03 compiler and removes staging after success. SSR and non-root-relative
bases without an explicit override fail with repair guidance. The initializer
modifies only a narrow, conventional object-form config and otherwise performs
no writes.

The Node/Fetch example renders fully before committing headers, serves the
runtime and font from the same origin, preserves ordinary cache headers,
demonstrates response rotation, and closes both HTTP server and engine on
termination. Its comment makes the streaming boundary explicit rather than
presenting buffering as a universal server adapter.

## Scope

- `packages/astro/`
- `packages/vite/`
- generic Fetch/Node helpers or examples in core
- initializer templates
- `examples/astro/`, `examples/vite-static/`, and `examples/node-fetch/`
- framework documentation

## Testing strategy

- `astro check`, Astro SSR/static builds, and navigation/failure E2E.
- An Astro component that scrambles only when its response stream is pulled, proving the final cache/header contract.
- Vite resolved base/outDir matrix and repeated-build safety.
- Hydrated island refusal fixtures.
- Plaintext scans across HTML, assets, and client chunks.
- Node/Fetch server contract tests including abort and streaming behavior.
- Strict CSP and subpath deployment browser tests.

## Risks

- Vite configuration AST editing can be unsafe; refusing with precise manual instructions is preferable to guessing.

## Exit criteria

Astro SSR and non-hydrated static fixtures, a normal Vite build, and a generic Node/Fetch server all work from documented setup, preserve selective caching, and satisfy the shared leakage and failure contracts.

## Implementation evidence

- `packages/astro/src/index.ts` implements typed, route-selective middleware with
  bounded lazy-stream buffering; `packages/astro/src/GlyphScramble.astro`
  delegates each block to the shared custom-element lifecycle.
- `packages/vite/src/index.ts` is a real Vite plugin that derives paths from
  `ResolvedConfig`, builds through a private staging tree, publishes atomically,
  and removes stale protected output across repeated builds.
- `packages/core/src/init.ts` safely scaffolds conventional Astro and Vite
  projects and refuses ambiguous Vite configuration instead of rewriting it.
- `examples/astro-ssr`, `examples/astro-static`, `examples/vite-static`, and
  `examples/node-fetch` are executable consumer fixtures rather than snippets.
- `tests/r10` exercises lazy Astro rendering, overflow/failure behavior, static
  refusal, non-root Vite output, repeat rotation, leakage scans, and the generic
  Node/Fetch boundary. CI runs the consumer suite independently.
- `packages/core/src/worker-compressor.ts` resolves the exported,
  self-contained file-backed `woff2-worker.mjs`; PR #42 removed the temporary
  eval-backed bundler workaround and proves the same artifact in Next and Astro.

## Review record

R10 closes the Astro/Vite/vanilla portions of findings S1, B4, U4, and D6 from
the 2026-09-03 repository review. It also exposed an S7 regression during the
post-merge documentation audit; PR #42 restored a no-eval, file-backed worker
before this design was marked implemented. The dedicated R10 suite covers the
lazy-stream and component lifecycle boundaries. Full browser-matrix and
client-navigation qualification remains intentionally centralized in R12.
