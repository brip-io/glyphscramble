# [DX-RESPONSE-BOUNDARY] Per-response inert HTML boundary

> Child of [DX-INSTRUMENTATION](DX-INSTRUMENTATION.md) — milestone **M4**.
>
> **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #91](https://github.com/brip-io/glyphscramble/pull/91) · **GitHub issue:** [#80](https://github.com/brip-io/glyphscramble/issues/80)
> **Blocked by:** DX-STATIC-BOUNDARY and R05 · **Blocks:** supported per-response subtree wrapping

## Objective

Apply the static boundary's descendant instrumentation to complete non-hydrated server HTML using a fresh response mapping, bounded buffering, selective cache policy, and the existing font endpoint.

## Supported boundary

The initial implementation targets Astro SSR without client islands and the generic Fetch/Node response primitive. It does not support Next RSC, hydrated Nuxt/SvelteKit pages, client-rendered Vite, or arbitrary streaming responses.

Authors use a framework-native `GlyphResponseBoundary` marker around an existing inert component. The owning middleware buffers the final HTML, validates every marked subtree, transforms it with the current request context, injects one matching loader/font contract, and only then releases bytes.

## Scope

- Extract a shared final-HTML subtree planner from static compilation without weakening static tests.
- Add a programmatic `transformGlyphHtmlResponse()` primitive with byte/time/signal bounds and content-free diagnostics.
- Integrate it into Astro's already-buffered strategy and the generic Fetch/Node example.
- Reuse one response variant for all nodes of the selected face and emit one font lifecycle per compatible boundary.
- Apply `private, no-store` only after a successful protected transformation; preserve ordinary response headers when no marker is used.
- Reject streaming after headers commit, HTML overflow, client islands, hydration data, unsafe nodes/attributes, mixed faces, and incomplete documents.
- Drain and close issued variants through existing engine lifecycle semantics.

## Requirements

1. Two successful responses for identical input MUST contain different encoded scalars and font tokens while rendering equivalently.
2. No response byte, error, script, attribute, or owned side channel MAY contain protected source text.
3. Transformation MUST finish before the first response byte or protected cache header is committed.
4. The default buffer is 2 MiB and the configurable ceiling MUST NOT exceed the core 16 MiB parser limit.
5. Abort, timeout, overload, restart, font failure, or unsafe content MUST return a generic closed failure rather than plaintext.
6. Unsupported hydrated frameworks MUST receive a build/configuration error, never a runtime downgrade.

## Testing strategy

- Add rotation, font retrieval, cache, HEAD, expiry, abort, timeout, overload, and instance-affinity tests.
- Scan HTML, headers, scripts, attributes, errors, RSC-like payloads, and generated CSS for known plaintext markers.
- Test multiple boundaries, nested same-font boundaries, mixed-font refusal, Unicode scripts, malformed HTML, and buffer ceilings.
- Run cross-browser visual comparisons and font-failure/no-JS/CSP states through Astro and generic Node consumers.
- Prove unprotected responses retain their original caching and streaming behavior.

## Risks

- Buffering adds latency and memory and removes streaming for protected pages. Keep the scope small and explicit.
- An HTML-only transform can create false confidence around application APIs. Documentation and `doctor` enumerate unprotected side channels.
- Astro or server middleware ordering may expose already-committed bytes. The integration must own the complete response boundary or refuse setup.

## Exit criteria

Astro and generic Node can wrap the same inert existing component, emit a fresh per-response encoding and font, preserve unprotected response behavior, and pass leakage, visual, cache, failure, and resource-bound tests without claiming hydrated-framework support.

## Implementation evidence

- Core exposes `transformGlyphHtmlResponse()`, versioned response marker helpers, 2 MiB default/16 MiB hard buffer bounds, abort and deadline handling, aggregate-only diagnostics, CSP nonces, selective no-store headers, and generic closed failures.
- Static and response modes share one final-HTML scanner. Response output rejects incomplete or malformed documents, client hydration, unsafe elements and attributes, inline typography overrides, mixed fonts, unchanged encoding, and recognizable response-owned plaintext copies.
- Astro publishes `GlyphResponseBoundary.astro` only for default bounded-buffer SSR middleware; route streaming, static builds, and client islands refuse the component. The generic Fetch/Node example transforms only its eligible complete route while ordinary streaming bypasses it.
- Qualification covers 275 unit/integration tests, 51 Chromium/Firefox/WebKit cases including visual equivalence, strict CSP, missing fonts, and disabled JavaScript, plus nine real Astro/Vite/Node consumer tests.
- The runtime benchmark now gates a 103,770-byte response at 10 ms; the local implementation run measured 8.162 ms p95 excluding variant acquisition.
