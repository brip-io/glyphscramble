# [R15] Developer experience and distribution

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented (PR pending) · **GitHub issue:** [#31](https://github.com/brip-io/glyphscramble/issues/31)
> **Blocked by:** R07-R10 package contracts · **Blocks:** R12 public beta and R13 final quickstarts

## Objective

Make the safe path the short path: a developer should be able to discover the correct package, initialize a supported project, protect one appropriate block, and verify the result in minutes, with consistent commands and concepts across frameworks. Publish each release through trustworthy, conventional channels without creating parallel registries or version drift.

## Background

The beta scaffold exposes too much architecture during onboarding. The generated config repeats response-pool watermarks, cache bytes, timeouts, token metadata, route prefixes, and static failure policy even though nearly all users should keep the same values. The current initializer writes integration files but leaves dependency installation, font preparation, secrets, and the first component invocation as disconnected manual steps. Package manifests provide `files` and `exports`, but omit consistent repository, homepage, bugs, and discovery metadata. The release workflow still authenticates with a long-lived `NPM_TOKEN`.

The public release should follow current registry guidance. npm recommends OIDC trusted publishing over persistent automation tokens and generates provenance automatically for public packages published from public repositories. npm also uses description and keywords for discovery and `files`/`exports` to define the installed surface. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm package metadata](https://docs.npmjs.com/files/package.json/)

## Goals

- Reduce decisions before first successful render without concealing safety-critical choices.
- Give every framework the same nouns, config shape, CLI sequence, error style, and verification story.
- Support npm, pnpm, Yarn, and Bun consumers without requiring pnpm in their applications.
- Make npm the canonical binary distribution and GitHub Releases the canonical source/evidence distribution.
- Make the small browser runtime usable from a version-pinned CDN URL for no-bundler integrations.
- Make prerelease/stable channels, provenance, compatibility, and rollback behavior unambiguous.

## Non-goals

- Publishing duplicate artifacts to JSR, GitHub Packages, or another registry in v0.1.
- Providing a hosted GlyphScramble service, remote build dependency, phone-home check, or runtime telemetry.
- Hiding font licensing, production-secret setup, static/per-response selection, or accessibility acknowledgement behind defaults.
- Auto-protecting arbitrary DOM, CMS output, navigation, forms, headings, or service-critical content.
- Treating a CDN import of the browser loader as a server-side scrambling solution.

## Design principles

1. **Progressive disclosure.** The starter config contains only choices the publisher must make. Tuning stays documented and typed but absent until needed.
2. **One golden path per deployment mode.** Framework pages show one recommended SSR path; static/per-build output is a separate explicit choice.
3. **Same concepts everywhere.** Adapters expose `glyphs.scramble`, `GlyphPayload`, `GlyphScramble`, the same font route, and the same failure vocabulary unless framework semantics require a named difference.
4. **Fail with a repair command.** CLI errors identify the collided file, unsupported topology, missing secret/font/licence, and the exact safe next action.
5. **No silent downgrade.** Per-response mode never becomes per-build or plaintext because a framework capability is unavailable.
6. **No channel without an owner.** Every published representation has a canonical upstream version and an automated drift check.

## Configuration contract

`defineGlyphConfig` normalizes stable safe defaults: response rotation, `GLYPHSCRAMBLE_SECRET`, a ten-minute token lifetime, `/_glyphscramble`, fail-closed unsupported-content behavior, and bounded response-pool, remote-fetch, and static-loader limits.

The minimal config MUST still name each font source and SPDX/licence file and MUST contain `accessibilityRiskAcknowledged: true`. Coverage is optional only when the prepared face is within the safe default size and coverage limits. Advanced rotation, capacity, remote-source, route, and static options remain available with generated type documentation.

Environment-specific runtime settings MAY be read through documented config code; the library does not invent a second environment-variable namespace for every option.

## Initializer and onboarding flow

The canonical command is `npx @brip/glyphscramble init`; equivalent `pnpm dlx`, `yarn dlx`, and `bunx` commands are published beside it.

On an interactive terminal, `init`:

1. detects the framework/version, package manager, workspace root, app/source layout, TypeScript use, and existing integration boundaries;
2. asks for delivery mode, font source, licence/SPDX confirmation, and the explicit accessibility-risk acknowledgement;
3. previews files and dependency changes before applying them;
4. installs the one adapter package appropriate to the detected framework unless `--no-install` is passed;
5. prepares the font, checks the production-secret contract, and prints one copyable protected-block example plus `doctor`/dev-server commands.

Flags provide the same path non-interactively: `--framework`, `--mode`, `--font`, `--license-spdx`, `--license-file`, `--acknowledge-accessibility-risk`, `--package-manager`, `--yes`, `--no-install`, and `--dry-run`. Missing safety input in non-interactive mode is an error, never an inferred consent.

Initialization MUST be idempotent. It may update files it previously generated when their signed template identity is unchanged; it must compose through documented framework APIs or refuse a collision before any write. Existing Proxy/middleware/hook/config files are never overwritten or silently skipped. A machine-readable result supports higher-level generators and tests.

## Framework usability contract

Each R07-R10 adapter MUST meet a shared rubric:

- one server-side `scramble(text, options)` call per protected value;
- one payload-only client component with reactive update and cleanup;
- one generated font endpoint or standard server boundary;
- request-local context reuse without application authors managing tokens;
- selective cache control only after protected output is used;
- framework-native composition for routes, hooks, middleware, streaming, CSP, and error handling;
- root and `src` layouts where the framework supports both;
- no more than three generated integration files plus config;
- a real packed-package consumer fixture and a copyable example that compiles unchanged.

`doctor` reports readiness as checks, not a single false-confidence score: config, prepared assets, secret, route reachability, cache policy, client leakage, unsuitable semantic content, static hydration, licence output, and package/framework compatibility. Every error includes a documentation anchor and repair action.

## Distribution channels

### npm registry — canonical installation

All `@brip/glyphscramble*` packages publish publicly to npm. Packages use explicit `exports`, declaration files, a minimal `files` allowlist, `sideEffects`, engine/peer ranges, licence, repository directory, homepage, bugs, author/organization, and searchable keywords. The CLI remains the `glyphscramble` binary of `@brip/glyphscramble`; BRIP does not depend on ownership of an unrelated unscoped package name.

Prereleases publish under the `beta` dist-tag. A prerelease MUST NOT move `latest`; only an approved stable release may do so. Every package in one monorepo release uses an intentionally compatible version set, and Changesets remains the version/changelog source.

### GitHub Releases — source and evidence

Every npm release has a matching immutable GitHub Release from the exact signed tag. It contains human release notes, source archives, package name/version/digest inventory, checksums, an SPDX or CycloneDX SBOM, qualification-manifest digest, and links to npm provenance. GitHub is not documented as an alternative package registry.

### Browser CDN — loader only

The dependency-free browser loader is emitted as a separately tested ESM artifact at a stable path inside `@brip/glyphscramble`. Documentation may show version-pinned jsDelivr and unpkg URLs with generated SRI where applicable. Unversioned, `latest`, server-core, and framework-adapter CDN imports are not documented. The CDN page states that the loader only renders an already-issued `GlyphPayload`; a server adapter or static compiler must still produce the scrambled content and font.

### Documentation and discovery

The R13 site, repository README, npm readmes, GitHub topics, release notes, and package metadata all link to the same mode chooser and compatibility matrix. Search/discovery language uses the approved claim, “raises the cost of bulk DOM scraping,” and never “stops AI scraping.” Examples include install tabs for npm/pnpm/Yarn/Bun but one canonical source file.

JSR and GitHub Packages are reconsidered only when measured demand justifies a second registry. Until then, adding either is a release-governance change because mirrored versions, attestations, support, and removal must remain consistent.

## Release and supply-chain contract

- Replace `NPM_TOKEN` publication with npm trusted publishing through GitHub Actions OIDC; restrict or revoke token-based package publishing after bootstrap.
- Pin third-party Actions to reviewed commit SHAs and use the protected `npm` environment required by R12.
- Publish only packed artifacts that passed Node 22/24 consumer tests, export/type checks, licence checks, malware/dependency audit, and secret scanning.
- Compare each tarball against its `files` allowlist and reject source maps, fixtures, local paths, credentials, or undeclared executables.
- Verify the tag, GitHub Release, package versions, npm dist-tags, digests, provenance, and SBOM in a post-publication read-only job.
- Document a deprecation/rollback procedure. Published npm versions are immutable; a bad version is deprecated with a reason and replaced by a new patch rather than silently altered.
- Enter and verify Changesets prerelease mode before versioning; beta tags MUST retain the prerelease suffix and publish only to the `beta` dist-tag.
- Use one enforced Node floor across `engines`, CI, README, contributing guidance, CLI execution, and consumer fixtures.
- Move generation-only Unicode data to root development dependencies so consumers do not install the roughly 33 MB UCD source package.
- Remove stale package/worktree references from repository configuration and reject new orphaned ignore/Changesets entries.

## Complexity budget and success metrics

- A supported greenfield framework fixture reaches first protected render in at most five developer commands after project creation.
- The default generated config contains no capacity/performance tuning fields.
- Each quickstart introduces at most five GlyphScramble-specific public concepts before the first render.
- Framework integrations remain within three generated files plus config.
- All supported package-manager install paths resolve the same packed release.
- A usability test with an unfamiliar developer records time, errors, abandoned steps, and documentation detours; median assisted-free completion target is under ten minutes.
- CI measures initializer-to-build success from clean fixtures so the metric cannot be satisfied by prose alone.

## Scope and deliverables

- Normalized public config input and generated minimal configs.
- Cross-framework adapter/initializer rubric and reusable conformance fixtures.
- Guided and non-interactive CLI initialization, package-manager detection, dry-run, idempotency, and actionable diagnostics.
- CLI `--version`, config discovery, up-front scalar parsing, optional verbose aggregate diagnostics, side-effect-free benchmark mode, and server-only misuse checks.
- Canonical npm/GitHub/CDN channel policy and complete package metadata.
- OIDC trusted publication, beta dist-tag policy, SBOM/checksums, post-publication verification, and rollback runbook.
- R13 onboarding, install tabs, compatibility/status, troubleshooting, and distribution reference pages.

## Testing strategy

- Table-driven config tests prove defaults and explicit safety requirements.
- Initializer tests cover npm/pnpm/Yarn/Bun, monorepos, root/`src`, JavaScript/TypeScript, existing integrations, dry-run, no-install, offline/install failure, reruns, and preflight collision atomicity.
- One conformance suite consumes each framework adapter through the shared rubric; framework fixtures add only semantic exceptions.
- Fresh temporary consumers install packed tarballs with all four package managers, compile public entry points, run the framework build, and reject undeclared/deep imports.
- `npm pack --dry-run`, publint, `arethetypeswrong`, SBOM, licence, export-map, provenance configuration, and secret/source-map scans gate release.
- A release rehearsal publishes to an isolated test package/tag, verifies `beta` without changing `latest`, downloads through npm and both documented CDNs, compares digests, and exercises deprecation/rollback without deleting artifacts.
- Documentation tests compile one canonical example behind every package-manager tab and crawl every package/release/docs link.
- CI checks generated Unicode drift, type-aware TypeScript promises, and Svelte/Astro/Vue source linting; duplicate builds and superseded runs are removed through explicit job contracts/concurrency.

## Risks

- An over-helpful initializer can damage an existing application. Preview, collision preflight, framework-native composition, `--dry-run`, and recoverable writes are mandatory.
- Defaults can become accidental ABI. Each is named, documented, benchmarked, and changed only with a Changeset and migration note.
- CDN delivery can imply a false zero-server promise. Only the payload loader is exposed and its boundary is repeated next to every CDN example.
- Four package managers multiply test time. Keep one small install fixture per manager and run deeper framework matrices on the repository package manager.
- New registries increase support and supply-chain surface. npm stays canonical until demand and ownership justify duplication.

## Dependencies

- R07-R10 implement the framework-specific behavior measured by the shared usability rubric.
- R13 publishes the generated onboarding, compatibility, and channel documentation.
- R12 consumes the packed-consumer, provenance, SBOM, dist-tag, and post-publication evidence and remains the final release gate.

## Exit criteria

An unfamiliar developer can use a documented package-manager command to initialize each qualified framework, understand the two delivery modes and safety trade-offs, render one suitable protected block without touching tuning controls, and repair expected failures from CLI guidance. The same release is installable from npm, auditable through an immutable GitHub Release and provenance/SBOM evidence, and—only for the loader—available through documented version-pinned CDN artifacts; no duplicate registry, silent downgrade, persistent publish token, or drifting example remains.
