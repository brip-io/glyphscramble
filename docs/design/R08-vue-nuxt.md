# [R08] Vue 3 and Nuxt 4 integration

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #57](https://github.com/brip-io/glyphscramble/pull/57) · **GitHub issue:** [#9](https://github.com/brip-io/glyphscramble/issues/9)
> **Blocked by:** R05, R06 · **Blocks:** R12

## Objective

Replace the Nuxt stub with a typed Nuxt Kit module and provide reactive Vue behavior across SSR, Nitro routes, streaming, and client navigation.

## Background

`packages/nuxt/src/module.ts` only writes `runtimeConfig.glyphscramble`. It does not use `defineNuxtModule`, register the component, add the font handler, provide event types, or install server middleware. The initializer writes separate middleware but silently skips existing files. `packages/vue/src/index.ts` mounts once and ignores later payload changes.

## Goals

- Make one npm module install the supported Nuxt integration.
- Share one request context through typed Nitro event state.
- Apply cache controls only to responses that used protection.
- React correctly to Vue prop changes and teardown.

## Non-goals

- Nuxt 3 support unless it falls within the declared peer contract and tests.
- Client-side plaintext scrambling.
- Implicit protection of Nuxt payload/state fields.

## Requirements

1. The module MUST use Nuxt Kit's supported module, component, server-handler, and type-template APIs.
2. Installation MUST register the Vue component, font route, request context middleware/plugin, and `App.Locals`/event typings without generated application boilerplate where Nuxt Kit suffices.
3. Nitro event state MUST contain one R05 response context per request.
4. Response cache headers MUST change only when that context was used.
5. Vue payload changes MUST cancel the prior R06 mount and load the replacement face before reveal.
6. Nuxt state, hydration payloads, errors, and client bundles MUST not contain protected plaintext.
7. Client navigation and parallel Nitro requests MUST not reuse contexts or tokens.
8. `init` MUST edit or report the required `nuxt.config` module entry accurately and never claim skipped integration succeeded.
9. A real Nuxt 4 fixture MUST build and run in CI against the declared Vue peer range.
10. A streamed/lazy Nitro fixture MUST prove `context.used` is finalized before headers commit; when the preset cannot observe body-time scrambling, the integration MUST require explicit route-scoped protection instead of guessing.
11. Vue/Nuxt components MUST expose the shared R18 timeout and localized generic-error options.

## Design

Publish a conventional `defineNuxtModule` package with runtime files under the Nuxt module layout. The module registers a named component from `@brip/glyphscramble-vue`, a prefixed server handler, a request plugin/middleware, and generated types. Runtime configuration contains only serializable non-secret settings; the secret remains server-only.

The Vue component uses a watcher tied to R06's mount handle and destroys prior state before applying new payloads.

Nuxt can finalize an ordinary endpoint's context before committing response
headers, but it cannot infer that a page has embedded a payload fetched from a
different Nitro request or that a lazy stream will scramble after the response
hook. `streaming.protectedRoutes` is therefore the explicit early-header
contract for those routes. It matches exact paths and descendants and applies
`private, no-store` at request start.

The request engine uses Node worker threads and keeps one-use font variants in
process memory. R08 consequently narrows v0.1 to Nitro's single-process
`node-server` preset and fails the build for edge or serverless presets. An
external R17 `FontVariantProvider` is required before those presets or multiple
instances can be qualified honestly.

## Scope

- `packages/nuxt/src/module.ts` plus runtime module files
- `packages/nuxt/src/index.ts`
- `packages/vue/src/index.ts`
- initializer detection/templates
- `examples/nuxt/`
- Nuxt/Vue documentation

## Testing strategy

- Nuxt module install/build/type-generation test.
- SSR HTML, Nuxt payload, JS chunk, and Nitro response leakage scans.
- Vue mount/update/unmount unit and browser tests.
- Navigation, streaming, concurrent request, token expiry, and font failure E2E.
- Protected versus ordinary route cache assertions.
- A delayed streamed render that scrambles after middleware return and asserts `private, no-store` before the first byte.
- Initializer tests with existing `nuxt.config` and server middleware.

## Risks

- Nitro/h3 response interception differs across deployment presets; qualify at least Node and one edge/serverless preset or narrow support.

## Exit criteria

Adding the module to a Nuxt 4 fixture installs all required runtime pieces, reactive updates work without leaks, protected responses rotate, and unprotected pages preserve their original cache behavior.

## Implementation evidence

- `packages/nuxt/src/module.ts` uses Nuxt Kit to register the Vue component,
  request plugin, font handler, server composable, and generated H3 context
  types from one module entry.
- `packages/nuxt/src/runtime/` owns one response context per H3 event, applies
  selective headers after normal handlers, and applies route-scoped headers
  before explicitly declared lazy or cross-request page rendering.
- `packages/core/src/init.ts` creates or safely patches conventional Nuxt
  module arrays, is idempotent, and refuses dynamic or ambiguous files before
  writing anything.
- `examples/nuxt` is a Nuxt 4.5 / Vue 3.5 production consumer. Its Playwright
  suite covers HTML, hydration and chunk leakage, reactive replacement,
  navigation rotation, concurrent isolation, token expiry, GET/HEAD routing,
  delayed streams, font failure, query-string route matching, and ordinary
  cache preservation.
- The package rejects unqualified Nitro edge and serverless presets with an
  actionable process-local provider explanation; CI runs the qualified Node
  consumer independently.
