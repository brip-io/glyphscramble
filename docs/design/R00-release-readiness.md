# [R00] Beta release-readiness remediation

> **Size:** L · **Priority:** P0 · **Status:** Proposed parent · **GitHub issue:** pending
> **Owner:** BRIP · **Reviewers:** runtime, framework, accessibility, security, and counsel/IP

> **This is a parent project.** It is delivered through twelve independently mergeable child issues. This document owns architecture, ordering, and release gates; each child owns its implementation and tests.

## Objective

Move GlyphScramble from a compelling proof of concept to an honestly qualified beta whose static and per-response modes match their documented security, caching, SEO, accessibility, and performance contracts.

## Background

The release-readiness review found two P0 architectural failures and several P1 contract gaps:

- per-response WOFF2 work runs synchronously on cache misses in `packages/core/src/engine.ts` and measured 681–2,075 ms on representative 182–877 KB faces;
- static post-processing rewrites HTML only, can corrupt raw-text descendants, and is not safe for hydrated applications;
- generated framework middleware applies `private, no-store` too broadly;
- static asset naming, accessibility behavior, font-face metadata, license output, client lifecycle handling, and framework scaffolds do not yet meet their documentation;
- the current ten-unit-test suite and synthetic Playwright check do not qualify real fonts, scripts, browsers, leakage surfaces, or supported framework releases.

The approved product claim remains: **GlyphScramble raises the cost of bulk DOM scraping.** It is not DRM and does not prevent headless browsers, OCR, downloaded-font analysis, plaintext side channels, or an authorized reader from recovering content.

## Cross-cutting requirements

1. Every child MUST merge independently with tests green and public APIs either compatible or covered by a Changeset.
2. Protected plaintext MUST be transformed before HTML, RSC, hydration data, protected JSON, or client bundles are produced.
3. Unsupported content MUST fail closed without returning plaintext.
4. Cache controls MUST apply only to responses containing a response-rotated payload.
5. Static mode MUST be described as per-build rotation and MUST reject unsafe hydrated use until a framework-aware transform exists.
6. Protected blocks MUST remain limited to opted-in, non-essential, normally noindex content; no plaintext accessibility mirror may be introduced.
7. Font notices and license metadata MUST accompany redistributed generated artifacts.
8. Performance claims MUST measure the complete request path, including permutation, cmap patching, and compression.
9. No adapter may be called supported until a consumer fixture builds and passes navigation and failure tests against the declared peer range.
10. Public release remains blocked on counsel/IP approval and all R12 release gates.

## Milestones and issue breakdown

### Release A — Safe foundations

#### R01 · Runtime font-generation architecture · **M**

Remove whole-font WOFF2 compression from the latency-sensitive request path, introduce bounded/coalesced generation, and enforce end-to-end performance budgets.

**Exit criterion:** supported reference faces meet the approved cold/warm p95 gates without duplicate concurrent work or unbounded memory.

#### R02 · Static transform safety · **M**

Make static output atomic and idempotent, reject raw-text/interactive/hydrated boundaries, and prove plaintext does not survive in supported static output.

**Exit criterion:** repeated clean and reused builds are byte-equivalent for the same inputs and seed, unsafe trees fail before output publication, and input remains recoverable.

#### R04 · Font-face resolution, coverage, and licensing · **M**

Represent real faces and CSS descriptors, implement coverage semantics, and emit notices and verifiable lock metadata.

**Exit criterion:** a multi-weight Google Fonts CSS source and direct local/remote faces produce deterministic, licensed, correctly described prepared artifacts.

#### R11 · Binary and Unicode hardening · **M**

Harden untrusted font/CSS parsing, pin Unicode generation inputs, and qualify cmap and shaping invariants with official and real fixtures.

**Exit criterion:** malformed inputs fail within bounded resources and real format 4/12/14 fonts pass checksum, OTS, Unicode, and HarfBuzz assertions.

### Release B — Correct runtime and delivery contracts

#### R03 · Static delivery, caching, CSP, and accessibility · **M**

Emit content-addressed, subpath-safe static assets with correct accessibility and failure behavior.

**Exit criterion:** an atomic static deployment remains correct across rebuilds, CDN caching, CSP enforcement, font failure, and accessibility-tree inspection.

#### R05 · Request-engine lifecycle and abuse boundaries · **M**

Bind font work to authorized faces, fix cache/HEAD/error behavior, support secret rotation, and expose whether a response actually used protection.

**Exit criterion:** token replay, expiry, malformed paths, concurrency, face authorization, cache bounds, and selective response headers pass deterministic tests.

#### R06 · Client payload and font-load lifecycle · **M**

Replace arbitrary CSS injection with a validated wire contract and leak-free, cancellable font registration shared by all UI adapters.

**Exit criterion:** repeated mount/update/unmount cycles leave no stale rules or timers and reveal only after the exact face succeeds.

### Release C — Qualified framework adapters

#### R07 · React and Next 16 · **M**

Provide a real request-scoped context, request-time rendering, route-scoped cache controls, streaming/RSC support, and safe initializer composition.

#### R08 · Vue 3 and Nuxt 4 · **M**

Ship a proper Nuxt Kit module plus reactive Vue payload handling and Nitro integration.

#### R09 · Svelte 5 and SvelteKit 2 · **M**

Ship typed, compiled Svelte artifacts and composable SvelteKit hooks/endpoints with navigation coverage.

#### R10 · Astro 7, Vite, and vanilla · **M**

Ship typed Astro middleware/components, a functional Vite integration, explicit non-hydrated static constraints, and generic Fetch/Node examples.

**Adapter exit criterion:** each declared framework reaches a protected page from `init`, preserves selective caching, rotates on navigation where promised, and passes font-failure and leakage tests.

### Release D — Evidence and controlled release

#### R12 · Cross-browser qualification and release gates · **M**

Exercise the complete real-font, script, browser, leakage, performance, packaging, and release matrix and prevent publication when any required evidence is missing.

**Exit criterion:** all beta gates are machine-enforced, counsel/IP approval is recorded, package tarballs are consumer-tested, and the release workflow cannot publish an unqualified tag.

## Dependency order

```text
R04 ─┬─▶ R01 ─▶ R05 ─┬─▶ R07 ─┐
     │                ├─▶ R08 ─┤
R11 ─┘                ├─▶ R09 ─┤
                      └─▶ R10 ─┤
R06 ─┬────────────────▶ adapters ├─▶ R12
     └─▶ R03 ────────────────▶ R10
R02 ───▶ R03
```

Hard orderings:

- R04 and R11 precede R01 because optimized generation must consume the final face model and trusted binary representation.
- R01 precedes R05 because cache and token policy must wrap the chosen generation architecture, not fossilize the current slow path.
- R05 and R06 precede server/UI adapters so every framework shares one lifecycle contract.
- R02, R04, and R06 precede R03 because static delivery consumes the safe transformer, final face metadata, and shared loader.
- R02 and R03 precede R10 because Vite/Astro static support must expose only the corrected static compiler.
- Every child precedes R12; R12 validates rather than invents missing functionality.

## Release policy

- Releases A–C may publish internal prerelease artifacts only.
- A public npm beta requires R12 and counsel/IP approval.
- Any failed visual, leakage, accessibility, performance, or consumer-build gate blocks publication rather than becoming a documentation caveat.
- Static mode may ship earlier than per-response mode only if its non-hydrated boundary is explicit in CLI errors, types, and documentation.

## Child issue ledger

| ID  | Design                                                                                | Size | Priority | GitHub issue |
| --- | ------------------------------------------------------------------------------------- | ---: | -------: | ------------ |
| R01 | [Runtime font-generation architecture](R01-runtime-font-generation.md)                |    M |       P0 | pending      |
| R02 | [Static transform safety](R02-static-transform-safety.md)                             |    M |       P0 | pending      |
| R03 | [Static delivery, caching, CSP, and accessibility](R03-static-delivery-a11y-cache.md) |    M |       P1 | pending      |
| R04 | [Font-face resolution, coverage, and licensing](R04-font-face-pipeline.md)            |    M |       P1 | pending      |
| R05 | [Request-engine lifecycle and abuse boundaries](R05-request-engine-lifecycle.md)      |    M |       P1 | pending      |
| R06 | [Client payload and font-load lifecycle](R06-client-runtime-contract.md)              |    M |       P1 | pending      |
| R07 | [React and Next 16 integration](R07-react-next.md)                                    |    M |       P1 | pending      |
| R08 | [Vue 3 and Nuxt 4 integration](R08-vue-nuxt.md)                                       |    M |       P1 | pending      |
| R09 | [Svelte 5 and SvelteKit 2 integration](R09-svelte-sveltekit.md)                       |    M |       P1 | pending      |
| R10 | [Astro 7, Vite, and vanilla integration](R10-astro-vite-vanilla.md)                   |    M |       P1 | pending      |
| R11 | [Binary and Unicode hardening](R11-binary-unicode-hardening.md)                       |    M |       P1 | pending      |
| R12 | [Cross-browser qualification and release gates](R12-qualification-release.md)         |    M |       P0 | pending      |

## Completion definition

R00 closes only when every child issue is complete, the release-gate workflow is green on Node 22 and 24, the counsel/IP gate is recorded, and public documentation matches observed behavior without future-tense qualification hidden behind a beta label.
