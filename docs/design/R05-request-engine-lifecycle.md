# [R05] Request-engine lifecycle and abuse boundaries

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #23](https://github.com/brip-io/glyphscramble/pull/23) · **GitHub issue:** [#6](https://github.com/brip-io/glyphscramble/issues/6)
> **Blocked by:** R01, R04, R11 · **Blocks:** R07-R10, R12

## Objective

Make response contexts, encrypted tokens, font authorization, caches, and response headers correct under expiry, concurrency, malformed input, key rotation, and selective use.

## Background

`packages/core/src/engine.ts` authorizes any configured face with any valid token, performs expensive work for `HEAD`, caches by entry count, and has no in-flight coalescing. `decodeURIComponent()` failures can escape route parsing. Framework middleware cannot tell whether a response context actually scrambled content, so it disables caching globally. Token claims do not bind faces or validate all issuance invariants.

## Goals

- Bind each token to the faces and variant identities needed by one response.
- Apply no-store only when response-rotated payloads are emitted.
- Bound replay-driven work and cache memory.
- Support safe secret rotation and predictable HTTP semantics.

## Non-goals

- Treating the token as content confidentiality.
- Preventing an authorized client from retaining a downloaded font.
- Global user identity, watermarking, or behavioral rate limiting.

## Requirements

1. A response context MUST track whether it emitted a payload and which face/variant IDs it authorized.
2. Tokens MUST validate version, key ID, seed/variant identity, issued-at, expiry, allowed faces, and maximum accepted lifetime.
3. Secrets MUST support active plus previous keys for zero-downtime rotation using domain-separated key derivation.
4. A valid token MUST NOT authorize generation for an unrelated configured face.
5. Malformed paths and percent encoding MUST return controlled 4xx responses without throwing.
6. `HEAD` MUST NOT trigger uncached expensive generation unless explicitly required and bounded.
7. Completed and in-flight caches MUST be byte-bounded, expiry-aware, and observable without logging tokens.
8. Font response `max-age` MUST reflect remaining token lifetime.
9. Protected response headers MUST be applied only when the context was used; adapters that cannot infer this MUST require route-scoped configuration.
10. Production startup MUST reject missing/weak secrets and document a secure generation command.

## Design

Introduce a versioned token envelope whose encrypted claims reference authorized prepared face and variant IDs from R01. `ResponseContext` exposes a read-only `used`/`usage()` result after rendering. Framework wrappers inspect this after `resolve/next` where their lifecycle permits it; Next receives a route-scoped contract in R07 because Proxy cannot observe downstream rendering.

The font handler is split into parse, authenticate, authorize, acquire, and respond stages so each can be tested. Caches use opaque keyed digests rather than raw tokens. Key configuration accepts a current key ID and bounded previous-key list.

## Scope

- `packages/core/src/token.ts`
- `packages/core/src/engine.ts`
- `packages/core/src/types.ts`
- shared adapter response-header helpers
- security and operations documentation

## Testing strategy

- Token expiry, future issuance, excessive TTL, wrong key ID, malformed seed, tamper, and key-rotation tests.
- Cross-face authorization and replay tests.
- Duplicate concurrency/coalescing and byte-budget eviction tests.
- GET/HEAD/POST, malformed URL, missing face, and remaining-TTL cache-header tests.
- Selective header tests proving unprotected responses retain their original cache policy.
- Structured log assertions proving tokens/seeds/mappings are never emitted.

## Risks

- Binding variants in tokens introduces state coordination with R01.
- Frameworks differ in whether middleware can observe downstream response usage.

## Exit criteria

Only authorized faces can be acquired, malformed or expired requests fail cheaply, caches are bounded and coalesced, secrets rotate safely, and unprotected responses preserve their cacheability.

## Implementation notes

Version 2 tokens carry an authenticated key ID and strictly validated issuance,
expiry, seed, variant, mode, and face claims. The active key plus at most three
previous keys are loaded from environment variables at startup and derive
domain-separated AES keys. A response context leases one R01 variant, issues
progressively authorized tokens as new faces are used, and exposes a
content-free immutable usage snapshot.

The font route returns controlled method/path/token/authorization errors before
variant lookup, serves `HEAD` only from prepared bytes, and computes cache age
from the remaining validated lifetime. Astro, Nuxt, and SvelteKit inspect
context use after rendering; Next remains route-scoped because its proxy cannot
observe downstream RSC rendering and is completed by R07.
