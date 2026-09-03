# [R07] React and Next 16 integration

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** [#8](https://github.com/brip-io/glyphscramble/issues/8)
> **Blocked by:** R05, R06 · **Blocks:** R12

## Objective

Ship a deployable React/Next 16 integration with one request-scoped context, explicit request-time rendering, selective caching, RSC/streaming/navigation correctness, and composable initialization.

## Background

The current README creates `beginResponse()` inside each component, multiplying tokens and font generation. `packages/next/src/index.ts:26-29` writes an unused random request header. The generated root `proxy.ts` applies `private, no-store` to every route and silently skips installation when a proxy already exists. No real Next consumer is compiled in CI.

## Goals

- Guarantee one response context per protected document/navigation response.
- Keep protected payloads out of Next caches beyond their token lifetime.
- Preserve caching for routes without protected content.
- Make initializer output compose with existing Proxy and `src/app` layouts.

## Non-goals

- Pages Router support in v0.1.
- Automatically rewriting arbitrary existing Proxy logic.
- Static-export protection beyond R02/R03's non-hydrated contract.

## Requirements

1. The server API MUST call Next's request-time rendering boundary before issuing a response-rotated payload.
2. All protected components in one request MUST reuse one request context through an approved request-local mechanism.
3. HTML and RSC navigation responses containing payloads MUST be `private, no-store`; unrelated routes MUST retain Next's cache policy.
4. Full-route, component, prefetch, router, and browser back/forward caches MUST not reuse an expired payload.
5. The font Route Handler MUST support the R05 GET/HEAD contract and declared Node runtime.
6. React components MUST wrap R06 lifecycle with Strict Mode-safe cleanup and reactive payload updates.
7. `init` MUST detect root versus `src/`, existing Proxy/routes, and either compose safely or stop with exact manual instructions.
8. Generated files MUST total no more than three integration files plus config, excluding an explicitly requested example.
9. Type boundaries MUST prevent ordinary Client Components from accepting plaintext APIs; runtime validation still applies.
10. A real Next 16 fixture MUST build and run in CI.

## Design

Create a server-only `getGlyphResponseContext()` that first invokes Next's request-time API and memoizes a context for the current RSC request. The public server helper consumes that context rather than encouraging `beginResponse()` per block. Protected route groups opt into a generated cache/header contract; Proxy is optional and matcher-scoped, not globally installed.

The initializer inspects `app`, `src/app`, existing `proxy.ts`, and route collisions. It never reports success when required integration was skipped.

## Scope

- `packages/next/src/`
- `packages/react/src/`
- Next-specific initializer templates in `packages/core/src/cli.ts`
- `examples/next/` consumer fixture
- React/Next quickstart and leakage documentation

## Testing strategy

- Next production build/typecheck against the declared peer range.
- Initial HTML, streamed RSC, client navigation, prefetch, refresh, back/forward, and concurrent-request tests.
- Multi-block assertion proving one response context and no duplicate font job.
- Protected/unprotected route cache-header assertions.
- Expiry and cached-payload failure prevention.
- Initializer fixtures for root/src layouts and existing Proxy composition/refusal.

## Risks

- Next caching behavior evolves quickly; pin fixture versions and update only with evidence.
- Request-local memoization must not cross concurrent RSC renders.

## Exit criteria

From `init`, a Next 16 App Router fixture renders multiple protected blocks through one request context, rotates on each dynamic response/navigation, preserves unprotected route caching, and passes RSC leakage and failure tests.
