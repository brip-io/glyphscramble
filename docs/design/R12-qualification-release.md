# [R12] Cross-browser qualification and release gates

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#13](https://github.com/brip-io/glyphscramble/issues/13)
> **Blocked by:** R01-R11, R13-R20 · **Blocks:** public beta

## Objective

Turn every beta claim into machine-enforced evidence across real browsers, frameworks, packages, leakage surfaces, performance, security, and release governance.

## Background

The current unit suite contains ten tests and the Playwright test only asserts that hardcoded scrambled text is hidden. The named tampered-token engine test changes the filename and returns 404 before token validation. Framework packages are not built inside real consumers, real generated fonts are not rendered in browser screenshots, and the release workflow can publish a GitHub release without a repository-enforced qualification/counsel gate.

## Goals

- Make release readiness objective and reproducible.
- Qualify the declared Node/framework/browser ranges with packed artifacts.
- Detect plaintext across every documented boundary.
- Prevent publication when counsel or technical evidence is missing.

## Non-goals

- Claiming resistance to headless browsers, OCR, or font analysis.
- Treating a benchmark from one developer machine as a universal SLA.
- Publishing automatically merely because tests pass.

## Requirements

1. CI MUST run on Node 22 and 24 and test packed tarballs rather than workspace-only resolution for consumer fixtures.
2. Chromium, Firefox, and WebKit MUST render real generated fonts for every qualified script, face style, variable axis, color font, vertical fixture, and failure state.
3. Visual comparison MUST cover original versus scrambled output with reviewed tolerances and artifact upload on failure.
4. Leakage tests MUST scan HTML, RSC, hydration data, JS chunks, source maps, protected JSON, CSS, comments, JSON-LD, OpenGraph, RSS/Atom, sitemaps, and configured CMS/API fixtures.
5. Adversarial tests MUST demonstrate both the commodity-parser friction and recoverability by a headless browser/font analyzer.
6. End-to-end performance gates MUST enforce the R01 budgets under cold, warm, concurrent, and overload conditions on Node 22/24.
7. Reliability tests MUST cover expiry/tamper, 404/CSP/CORS, navigation, streaming, concurrent responses, cold starts, missing secrets, key rotation, and mixed static builds.
8. `inspect`, `doctor`, and `benchmark` output MUST match implemented capabilities; doctor MUST use framework/build-aware checks rather than regex-only confidence.
9. `npm pack` contents, exports, types, licenses, provenance configuration, dependency audit, and `arethetypeswrong`/consumer imports MUST be gated.
10. GitHub Actions MUST pin third-party actions by commit SHA and apply least-privilege permissions.
11. Publishing MUST require a protected release environment with recorded counsel/IP approval and an explicit checklist artifact.
12. Documentation claims and version/status labels MUST be generated or checked against the qualification manifest.
13. The R13 site and R14 demo MUST pass link, example, claim, agent-readable-output, accessibility, browser, CSP, no-JS, and performance gates against packed release candidates.
14. R15 onboarding and distribution evidence MUST prove clean package-manager installs, correct npm dist-tags, OIDC provenance, immutable source evidence, SBOM/checksums, and version-pinned loader CDN parity.
15. CI MUST run generated-Unicode checks, dependency audit/review, secret scanning, and superseded-run concurrency; release qualification MUST include browser and benchmark gates rather than relying on `pnpm check` alone.
16. Action runtime deprecations and third-party pin updates MUST be surfaced by a scheduled maintenance check instead of appearing first during release.

## Design

Create a versioned `qualification-manifest.json` listing every supported runtime, framework, browser, script, font fixture, mode, performance budget, and required test job. CI validates that the manifest and package peer ranges agree. Each matrix job produces machine-readable results and human-reviewable screenshots/traces.

Release runs only from an exact signed tag after the qualification workflow for that commit succeeds. The protected `npm` environment requires manual counsel/IP approval. A release attestation records commit, package digests, qualification manifest digest, test run, and approval reference.

## Scope

- unit/integration/E2E/performance test trees
- real framework examples and packed-package consumers
- Playwright configuration and visual baselines
- CLI doctor/inspect/benchmark validation
- `.github/workflows/ci.yml` and `release.yml`
- dependency/release policies and public documentation
- R13 documentation-site and R14 demo qualification artifacts
- R15 onboarding and distribution qualification artifacts

## Testing strategy

This issue is the testing strategy for the release. It adds meta-tests that fail when a declared peer/browser/script lacks a corresponding fixture or when a package/claim is absent from the qualification manifest.

The current false token-tamper test is replaced with mutations inside the encoded token while retaining a valid route filename. Browser tests load the actual engine-generated WOFF2 and compare screenshot, DOM bytes, accessibility tree, and network/cache behavior. The same release candidate builds the public docs examples and R14 fixtures so a green site cannot describe or demonstrate a different package than the one being published.

## Risks

- Cross-browser visual baselines can become noisy; tool/font versions and tolerances must be pinned.
- The matrix can consume excessive CI time; shard by invariant while keeping all release gates mandatory.

## Exit criteria

One commit passes the complete manifest on Node 22/24 and three browsers using packed packages; the R13 site and R14 demo pass their claim, content, accessibility, browser, and performance gates; all technical and counsel gates are recorded; and the release workflow demonstrably refuses an unqualified or unapproved tag.
