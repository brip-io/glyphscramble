# [R09] Svelte 5 and SvelteKit 2 integration

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #58](https://github.com/brip-io/glyphscramble/pull/58) · **GitHub issue:** [#10](https://github.com/brip-io/glyphscramble/issues/10)
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
10. Deferred/streamed `load` fixtures MUST prove protected bytes cannot render after cache headers were derived; unsupported lifecycle shapes MUST require route-scoped protection.
11. Component timeout and localized generic-error options MUST match the shared R18 contract.

## Design

Use Svelte package tooling to emit a standard component library and declarations. `createGlyphHandle()` returns a genuine SvelteKit `Handle` and can be passed directly to `sequence(existing, glyphHandle)`. Locals augmentation is emitted through a documented `app.d.ts` snippet or package-safe declaration strategy.

The component delegates to a typed Svelte action. That action owns one R06
mount handle, updates the existing handle for semantic payload changes, remounts
only when lifecycle options change, and destroys it when the element unmounts.

`createGlyphHandle()` is a real SvelteKit `Handle` augmented with lifecycle
methods. It intercepts only the configured font prefix, creates one context for
every other request, and stores it in typed `event.locals`. After ordinary
resolution it clones the response and applies selective headers. Because a
deferred load can outlive that observation point, canonical
`streaming.protectedRoutes` commit `private, no-store` before resolution; each
entry matches its exact path and descendants.

The runtime keeps generated variants in process memory. R09 therefore qualifies
the Node adapter in a single process on Node 22/24. Edge, serverless, clustered,
and horizontally scaled shapes remain unsupported until an external provider
can make an issued variant available to the later font request.

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
- A deferred/streamed load assertion that detects header finalization before protected rendering.
- Leakage scans across HTML, serialized load data, JS, and errors.
- Font timeout, 404, expiry, and component teardown tests.

## Risks

- Incorrect handle ordering can apply cache/security headers too early or too broadly; example composition must be explicit.

## Exit criteria

A packaged Svelte component and real SvelteKit handle compile against supported peers, compose with an existing hook, rotate correctly through navigation, and leave no plaintext or client lifecycle leaks.

## Implementation evidence

- `packages/svelte` is built with `svelte-package`, checked with `svelte-check`
  against Svelte 5, and publishes compiled source plus declarations from
  `dist` rather than an unchecked repository component.
- Its component and action accept the shared R18 timeout/localized-error
  options and implement mount, semantic update, option remount, stale-work
  cancellation, and destroy through R06.
- `packages/sveltekit` imports real `Handle`, `RequestEvent`, and
  `RequestHandler` types, provides a typed locals accessor, scopes font routing,
  preserves ordinary response caching, and supports explicit early headers for
  deferred/streamed routes.
- `glyphscramble init` creates the helper, locals declaration, and a hook when
  safe. Existing hooks are preserved with exact `sequence()` instructions;
  ambiguous multiple server hooks fail before any write.
- `examples/sveltekit` is a SvelteKit 2 / Svelte 5 adapter-node production
  consumer with an existing composed hook, direct server loads, protected JSON,
  deferred data, navigation, and failure fixtures.
- Its Playwright suite covers HTML, serialized data, client-chunk and error
  leakage; reactive replacement and equivalent clones; request isolation,
  rotation, GET/HEAD fonts, token expiry, ordinary caching, delayed streaming,
  stale completion, and localized font failure. CI runs it independently.
