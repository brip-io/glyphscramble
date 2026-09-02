# [R10] Astro 7, Vite, and vanilla integration

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** pending
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

## Design

Astro publishes middleware typed with the official API and a component that invokes a small shared R06 module once per node with teardown. Static mode operates after Astro build only on R02-approved non-hydrated markers.

The Vite plugin captures `outDir`, `base`, and build mode during `configResolved`; it either stages Vite output into a separate protected directory or performs R02's atomic publish flow. The initializer patches a simple `vite.config` only when syntax is safely recognized, otherwise prints an exact manual snippet and exits nonzero/incomplete.

## Scope

- `packages/astro/`
- `packages/vite/`
- generic Fetch/Node helpers or examples in core
- initializer templates
- `examples/astro/`, `examples/vite-static/`, and `examples/node-fetch/`
- framework documentation

## Testing strategy

- `astro check`, Astro SSR/static builds, and navigation/failure E2E.
- Vite resolved base/outDir matrix and repeated-build safety.
- Hydrated island refusal fixtures.
- Plaintext scans across HTML, assets, and client chunks.
- Node/Fetch server contract tests including abort and streaming behavior.
- Strict CSP and subpath deployment browser tests.

## Risks

- Vite configuration AST editing can be unsafe; refusing with precise manual instructions is preferable to guessing.

## Exit criteria

Astro SSR and non-hydrated static fixtures, a normal Vite build, and a generic Node/Fetch server all work from documented setup, preserve selective caching, and satisfy the shared leakage and failure contracts.
