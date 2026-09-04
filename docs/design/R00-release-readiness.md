# [R00] Beta release-readiness remediation

> **Size:** L · **Priority:** P0 · **Status:** In progress · **GitHub issue:** [#1](https://github.com/brip-io/glyphscramble/issues/1)
> **Owner:** BRIP · **Reviewers:** runtime, framework, accessibility, security, and counsel/IP

> **This is a parent project.** It is delivered through twenty independently mergeable child issues. This document owns architecture, ordering, and release gates; each child owns its implementation and tests.

## Objective

Move GlyphScramble from a compelling proof of concept to an honestly qualified beta whose static and per-response modes match their documented security, caching, SEO, accessibility, and performance contracts.

## Background

The release-readiness review found two P0 architectural failures and several P1 contract gaps:

- per-response WOFF2 work runs synchronously on cache misses in `packages/core/src/engine.ts` and measured 681–2,075 ms on representative 182–877 KB faces;
- static post-processing rewrites HTML only, can corrupt raw-text descendants, and is not safe for hydrated applications;
- generated framework middleware applies `private, no-store` too broadly;
- static asset naming, accessibility behavior, font-face metadata, license output, client lifecycle handling, and framework scaffolds do not yet meet their documentation;
- the initial ten-unit-test suite and synthetic Playwright check did not qualify real fonts, scripts, browsers, leakage surfaces, or supported framework releases.

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
10. Public release remains blocked on the open R13-R15 and R19 work,
    counsel/IP approval, and all R12 release gates.

## Milestones and issue breakdown

### Release A — Safe foundations

#### R01 · Runtime font-generation architecture · **M** · **Implemented in [PR #19](https://github.com/brip-io/glyphscramble/pull/19)**

Remove whole-font WOFF2 compression from the latency-sensitive request path, introduce bounded/coalesced generation, and enforce end-to-end performance budgets.

**Exit criterion:** supported reference faces meet the approved cold/warm p95 gates without duplicate concurrent work or unbounded memory.

#### R02 · Static transform safety · **M** · **Implemented in [PR #21](https://github.com/brip-io/glyphscramble/pull/21)**

Make static output atomic and idempotent, reject raw-text/interactive/hydrated boundaries, and prove plaintext does not survive in supported static output.

**Exit criterion:** repeated clean and reused builds are byte-equivalent for the same inputs and seed, unsafe trees fail before output publication, and input remains recoverable.

#### R04 · Font-face resolution, coverage, and licensing · **M** · **Implemented in [PR #15](https://github.com/brip-io/glyphscramble/pull/15)**

Represent real faces and CSS descriptors, implement coverage semantics, and emit notices and verifiable lock metadata.

**Exit criterion:** a multi-weight Google Fonts CSS source and direct local/remote faces produce deterministic, licensed, correctly described prepared artifacts.

#### R11 · Binary and Unicode hardening · **M** · **Implemented in [PR #16](https://github.com/brip-io/glyphscramble/pull/16)**

Harden untrusted font/CSS parsing, pin Unicode generation inputs, and qualify cmap and shaping invariants with official and real fixtures.

**Exit criterion:** malformed inputs fail within bounded resources, pinned Unicode data reproduces byte-for-byte, deterministic `cmap` selection is verified, and the real variable-font smoke fixture passes checksum plus available tool assertions. R12 owns the complete format/script/browser release matrix.

### Release B — Correct runtime and delivery contracts

#### R03 · Static delivery, caching, CSP, and accessibility · **M** · **Implemented in [PR #27](https://github.com/brip-io/glyphscramble/pull/27)**

Emit content-addressed, subpath-safe static assets with correct accessibility and failure behavior.

**Exit criterion:** an atomic static deployment remains correct across rebuilds, CDN caching, CSP enforcement, font failure, and accessibility-tree inspection.

#### R05 · Request-engine lifecycle and abuse boundaries · **M** · **Implemented in [PR #23](https://github.com/brip-io/glyphscramble/pull/23)**

Bind font work to authorized faces, fix cache/HEAD/error behavior, support secret rotation, and expose whether a response actually used protection.

**Exit criterion:** token replay, expiry, malformed paths, concurrency, face authorization, cache bounds, and selective response headers pass deterministic tests.

#### R06 · Client payload and font-load lifecycle · **M** · **Implemented in [PR #25](https://github.com/brip-io/glyphscramble/pull/25)**

Replace arbitrary CSS injection with a validated wire contract and leak-free, cancellable font registration shared by all UI adapters.

**Exit criterion:** repeated mount/update/unmount cycles leave no stale rules or timers and reveal only after the exact face succeeds.

### Release C — Qualified framework adapters

#### R07 · React and Next 16 · **M** · **Implemented in [PR #39](https://github.com/brip-io/glyphscramble/pull/39)**

Provide a real request-scoped context, request-time rendering, route-scoped cache controls, streaming/RSC support, and safe initializer composition.

#### R08 · Vue 3 and Nuxt 4 · **M** · **Implemented in [PR #57](https://github.com/brip-io/glyphscramble/pull/57)**

Ship a proper Nuxt Kit module plus reactive Vue payload handling and Nitro integration.

#### R09 · Svelte 5 and SvelteKit 2 · **M** · **Implemented in [PR #58](https://github.com/brip-io/glyphscramble/pull/58)**

Ship typed, compiled Svelte artifacts and composable SvelteKit hooks/endpoints with navigation coverage.

#### R10 · Astro 7, Vite, and vanilla · **M** · **Implemented in [PR #41](https://github.com/brip-io/glyphscramble/pull/41), corrected by [PR #42](https://github.com/brip-io/glyphscramble/pull/42)**

Ship typed Astro middleware/components, a functional Vite integration, explicit non-hydrated static constraints, and generic Fetch/Node examples.

**Adapter exit criterion:** each declared framework reaches a protected page from `init`, preserves selective caching, rotates on navigation where promised, and passes font-failure and leakage tests.

### Release D — Evidence and controlled release

#### R13 · Developer documentation website · **M**

Build a static-first, public documentation site with one canonical content registry, qualified quickstarts, search, Markdown/LLM outputs, and mechanical checks for claims, examples, SEO, accessibility, and performance.

**Exit criterion:** a developer can choose a safe content block and delivery mode, complete a qualified integration, and inspect accurate limitations through human- and agent-readable pages whose examples and support claims cannot drift from the packages.

#### R14 · Raw-agent and human-rendering conceptual demo · **M**

Use real generated artifacts to animate the raw-fetch, human-rendering, rotation, static-build, and advanced-recovery paths without implying universal resistance to agents.

**Exit criterion:** the demo proves different encoded responses render identically, distinguishes static per-build reuse, exposes the recoverability boundary, and passes no-motion, no-JS, failure, browser, accessibility, claim, and performance gates.

#### R15 · Developer experience and distribution · **M**

Normalize safe defaults, enforce one cross-framework usability rubric, make initialization guided and automation-friendly, and publish through canonical npm, immutable GitHub Release, provenance/SBOM, and loader-only CDN channels.

**Exit criterion:** an unfamiliar developer reaches a verified protected block through the same short workflow in every qualified framework, while every release channel resolves to one auditable version without duplicate registries or long-lived publish credentials.

#### R16 · Permutation and request-path efficiency · **M** · **Implemented in [PR #44](https://github.com/brip-io/glyphscramble/pull/44), corrected by [PR #45](https://github.com/brip-io/glyphscramble/pull/45)**

Retain generation-time mappings on variants, replace per-swap HMAC with an unbiased keystream, and make request encoding proportional to protected text rather than font repertoire.

#### R17 · Runtime capacity, lifecycle, and observability · **M** · **Implemented in [PR #47](https://github.com/brip-io/glyphscramble/pull/47)**

Add bounded async acquisition, scalable expiry, persistent workers, graceful drain, diagnostics, stable benchmark methodology, and an evidence-based WOFF 1.0 spike.

#### R18 · Multi-face payload and client efficiency · **M** · **Implemented in [PR #53](https://github.com/brip-io/glyphscramble/pull/53)**

Keep authorization stable across faces, deduplicate descriptors/downloads, and make equivalent client payload updates lifecycle no-ops.

#### R19 · Static compiler scale and diagnostics · **M** · **Implemented in [PR #59](https://github.com/brip-io/glyphscramble/pull/59)**

Make static traversal near-linear, move text failures into contextual planning, and introduce bounded deterministic I/O concurrency.

#### R20 · Core contract and operator hardening · **M** · **Implemented in [PR #49](https://github.com/brip-io/glyphscramble/pull/49)**

Align client/server bounds, cap timers, improve font/content/remote errors, correct token lifecycle/log guidance, and derive lockfile version from the package.

#### R12 · Cross-browser qualification and release gates · **M**

Exercise the complete real-font, script, browser, leakage, performance, packaging, and release matrix and prevent publication when any required evidence is missing.

**Exit criterion:** all beta gates are machine-enforced, counsel/IP approval is recorded, package tarballs are consumer-tested, and the release workflow cannot publish an unqualified tag.

## Dependency order

```text
R04 ─▶ R11 ─▶ R01 ─▶ R05 ─┬─▶ R07 ─┐
                           ├─▶ R08 ─┤
                           ├─▶ R09 ─┤
                           └─▶ R10 ─┤
R06 ─┬────────────────▶ adapters ├─▶ R13 ─┐
     ├─▶ R03 ────────────────▶ R10       ├─▶ R12
     └────────────────────────▶ R14 ──────┘
R02 ───▶ R03
R03/R05 ───────────────────────▶ R14
R07-R10 ───────────────────────▶ R15 ─▶ R13/R12
R11 ─▶ R16 ─▶ R17 ────────────────▶ R12
R06/R16 ─▶ R18 ───────────────────▶ R12
R02/R03 ─▶ R19 ───────────────────▶ R12
R04-R06/R11 ─▶ R20 ───────────────▶ R12
```

Hard orderings:

- R04 precedes R11 because hardening consumes the final prepared-family/face model; R11 then precedes R01 so optimized generation is built on the validated binary representation.
- R01 precedes R05 because cache and token policy must wrap the chosen generation architecture, not fossilize the current slow path.
- R05 and R06 precede server/UI adapters so every framework shares one lifecycle contract.
- R02, R04, and R06 precede R03 because static delivery consumes the safe transformer, final face metadata, and shared loader.
- R02 and R03 precede R10 because Vite/Astro static support must expose only the corrected static compiler.
- R13 consumes final adapter behavior and R14 consumes the static/request/client contracts; both precede R12 so release qualification tests public claims and evidence rather than inventing them.
- R15 consumes every adapter's public shape, feeds the final R13 quickstarts, and supplies R12's distribution and onboarding evidence.
- R16 precedes R17 so capacity measurements exclude avoidable request-path permutation work; R18 consumes the retained mapping/face model.
- R19 follows static safety/delivery, while R20 follows the final font, request, client, and parser boundaries.
- Every child precedes R12; R12 validates rather than invents missing functionality.

## Release policy

- Releases A–C may publish internal prerelease artifacts only.
- A public npm beta requires R12 and counsel/IP approval.
- Any failed visual, leakage, accessibility, performance, or consumer-build gate blocks publication rather than becoming a documentation caveat.
- Static mode may ship earlier than per-response mode only if its non-hydrated boundary is explicit in CLI errors, types, and documentation.

## Child issue ledger

| ID  | Design                                                                                | Size | Priority | GitHub issue                                              |
| --- | ------------------------------------------------------------------------------------- | ---: | -------: | --------------------------------------------------------- |
| R01 | [Runtime font-generation architecture](R01-runtime-font-generation.md)                |    M |       P0 | [#2](https://github.com/brip-io/glyphscramble/issues/2)   |
| R02 | [Static transform safety](R02-static-transform-safety.md)                             |    M |       P0 | [#3](https://github.com/brip-io/glyphscramble/issues/3)   |
| R03 | [Static delivery, caching, CSP, and accessibility](R03-static-delivery-a11y-cache.md) |    M |       P1 | [#4](https://github.com/brip-io/glyphscramble/issues/4)   |
| R04 | [Font-face resolution, coverage, and licensing](R04-font-face-pipeline.md)            |    M |       P1 | [#5](https://github.com/brip-io/glyphscramble/issues/5)   |
| R05 | [Request-engine lifecycle and abuse boundaries](R05-request-engine-lifecycle.md)      |    M |       P1 | [#6](https://github.com/brip-io/glyphscramble/issues/6)   |
| R06 | [Client payload and font-load lifecycle](R06-client-runtime-contract.md)              |    M |       P1 | [#7](https://github.com/brip-io/glyphscramble/issues/7)   |
| R07 | [React and Next 16 integration](R07-react-next.md)                                    |    M |       P1 | [#8](https://github.com/brip-io/glyphscramble/issues/8)   |
| R08 | [Vue 3 and Nuxt 4 integration](R08-vue-nuxt.md)                                       |    M |       P1 | [#9](https://github.com/brip-io/glyphscramble/issues/9)   |
| R09 | [Svelte 5 and SvelteKit 2 integration](R09-svelte-sveltekit.md)                       |    M |       P1 | [#10](https://github.com/brip-io/glyphscramble/issues/10) |
| R10 | [Astro 7, Vite, and vanilla integration](R10-astro-vite-vanilla.md)                   |    M |       P1 | [#11](https://github.com/brip-io/glyphscramble/issues/11) |
| R11 | [Binary and Unicode hardening](R11-binary-unicode-hardening.md)                       |    M |       P1 | [#12](https://github.com/brip-io/glyphscramble/issues/12) |
| R12 | [Cross-browser qualification and release gates](R12-qualification-release.md)         |    M |       P0 | [#13](https://github.com/brip-io/glyphscramble/issues/13) |
| R13 | [Developer documentation website](R13-documentation-website.md)                       |    M |       P1 | [#28](https://github.com/brip-io/glyphscramble/issues/28) |
| R14 | [Raw-agent and human-rendering conceptual demo](R14-agent-human-demo.md)              |    M |       P1 | [#29](https://github.com/brip-io/glyphscramble/issues/29) |
| R15 | [Developer experience and distribution](R15-developer-experience-distribution.md)     |    M |       P1 | [#31](https://github.com/brip-io/glyphscramble/issues/31) |
| R16 | [Permutation and request-path efficiency](R16-permutation-request-path.md)            |    M |       P0 | [#33](https://github.com/brip-io/glyphscramble/issues/33) |
| R17 | [Runtime capacity, lifecycle, and observability](R17-runtime-capacity-lifecycle.md)   |    M |       P0 | [#34](https://github.com/brip-io/glyphscramble/issues/34) |
| R18 | [Multi-face payload and client efficiency](R18-multiface-payload-efficiency.md)       |    M |       P1 | [#35](https://github.com/brip-io/glyphscramble/issues/35) |
| R19 | [Static compiler scale and diagnostics](R19-static-scale-diagnostics.md)              |    M |       P1 | [#36](https://github.com/brip-io/glyphscramble/issues/36) |
| R20 | [Core contract and operator hardening](R20-core-operator-hardening.md)                |    M |       P1 | [#37](https://github.com/brip-io/glyphscramble/issues/37) |

## Completion definition

R00 closes only when all twenty child issues are complete, the release-gate workflow is green on Node 22 and 24, the counsel/IP gate is recorded, and public documentation matches observed behavior without future-tense qualification hidden behind a beta label.
