# [R09] Svelte 5 and SvelteKit 2 integration

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** pending
> **Blocked by:** R05, R06 · **Blocks:** R12

## Objective

Publish compiled and typed Svelte artifacts plus a composable SvelteKit request hook and endpoint that preserve rotation, selective caching, navigation, and cleanup semantics.

## Background

The `.svelte` component is shipped from source but excluded from TypeScript/Svelte checking by `packages/svelte/tsconfig.json`. The action updates payloads but has no destroy path. `packages/sveltekit/src/index.ts` uses handwritten framework-like types rather than compiling against SvelteKit, and initializer output silently skips an existing `hooks.server.ts` instead of composing with it.

## Goals

- Validate package output through Svelte's compiler and package tooling.
- Compose with existing SvelteKit hooks.
- Reuse one typed response context per request.
- Handle client navigation, updates, and teardown through R06.

## Non-goals

- Svelte 4 compatibility.
- Protecting plaintext placed in `load` data or client stores by application code.
- Automatically rewriting complex user hooks without review.

## Requirements

1. Published Svelte components MUST be compiled/packaged and checked with the declared Svelte peer version.
2. The action/component MUST implement mount, update, and destroy through R06.
3. SvelteKit types MUST be imported from the real framework and augment `App.Locals` with one response context.
4. The integration MUST export a composable handle suitable for SvelteKit `sequence()`.
5. Font endpoint routing MUST implement R05 without intercepting unrelated endpoints.
6. Cache headers MUST change only after a protected payload was emitted.
7. SSR HTML, serialized `load` data, hydration state, client bundles, and error pages MUST be included in leakage tests.
8. `init` MUST detect existing hooks and generate a composable helper/import instruction rather than silently doing nothing.
9. A real SvelteKit 2 fixture MUST build and run in CI.

## Design

Use Svelte package tooling to emit a standard component library and declarations. `createGlyphHandle()` returns a genuine SvelteKit `Handle` and can be passed directly to `sequence(existing, glyphHandle)`. Locals augmentation is emitted through a documented `app.d.ts` snippet or package-safe declaration strategy.

The component owns an R06 mount handle in an effect and destroys it whenever the payload changes or the node unmounts.

## Scope

- `packages/svelte/` build and package configuration
- `packages/sveltekit/src/`
- initializer templates and diagnostics
- `examples/sveltekit/`
- Svelte/SvelteKit documentation

## Testing strategy

- `svelte-check`, package build, and package-consumer type tests.
- SSR and client navigation E2E with rapid payload replacement.
- Existing-hook composition and order tests.
- Protected/unprotected cache assertions.
- Leakage scans across HTML, serialized load data, JS, and errors.
- Font timeout, 404, expiry, and component teardown tests.

## Risks

- Incorrect handle ordering can apply cache/security headers too early or too broadly; example composition must be explicit.

## Exit criteria

A packaged Svelte component and real SvelteKit handle compile against supported peers, compose with an existing hook, rotate correctly through navigation, and leave no plaintext or client lifecycle leaks.
