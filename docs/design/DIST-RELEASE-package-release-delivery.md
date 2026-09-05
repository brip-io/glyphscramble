# [DIST-RELEASE] Package release delivery

> **Size:** L · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#65](https://github.com/brip-io/glyphscramble/issues/65)
> **Owner:** BRIP Engineering · **Reviewers:** release, security, developer experience, and counsel/IP

> **This is a parent project.** It is delivered through five independently mergeable child issues. This document owns channel policy, ordering, and the release-control boundary; each child owns its implementation and tests.

## Objective

Turn GlyphScramble's already-built package artifacts into a public, trustworthy, recoverable, and easy-to-install release path for all nine `@brip/glyphscramble*` packages.

## Background

R15 established package metadata, packed-consumer checks, Changesets beta mode, artifact inventories, checksums, an SPDX SBOM, post-publication verification, and an OIDC-shaped release workflow. A live-registry audit on 2026-09-05 found the remaining delivery gap:

- none of the nine package names exists on npm yet;
- the repository has no configured GitHub `npm` environment even though the workflow references one;
- beta documentation tells developers to run unqualified commands such as `npx @brip/glyphscramble init`, while prereleases are intentionally published only under the `beta` dist-tag;
- publication begins after a GitHub Release is published, publishes packages one by one, and only then uploads and validates release evidence;
- packed-tarball tests prove package-manager compatibility inside the repository, but no clean consumer test installs the artifacts from the public registry and documented CDNs.

The bootstrap and permanent release paths are necessarily different. npm trusted publishing and staged publishing can secure later releases, but staged publishing requires the package to exist already. The first public version therefore needs a narrow, explicitly retired bootstrap credential. Subsequent releases use GitHub Actions OIDC, a protected environment, npm stage-only trusted publishing, immutable evidence, and resumable verification. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [`npm stage`](https://docs.npmjs.com/cli/v11/commands/npm-stage/)

## Goals

- Make the documented beta command resolve on a clean developer machine.
- Bootstrap all nine public scoped packages without leaving a long-lived npm credential.
- Build and qualify one immutable artifact set before any registry mutation.
- Make the permanent release path identity-bound, approval-gated, staged, resumable, and independently verifiable.
- Prove installation and representative framework builds from the public registry rather than workspace tarballs alone.
- Give maintainers a tested release, partial-failure recovery, deprecation, rollback, and credential-compromise runbook.

## Non-goals

- Adding JSR, GitHub Packages, Homebrew, or another canonical registry in v0.1.
- Publishing before R12 qualification, R13/R14 documentation and demo work, and counsel/IP approval are complete.
- Moving the npm `latest` dist-tag during beta.
- Making CDN delivery available for server packages or framework adapters; only the browser payload loader is a supported CDN artifact.
- Introducing a hosted BRIP dependency, runtime telemetry, injected branding, or phone-home behavior.

## Release-channel decisions

### npm is the installation channel

All nine packages publish publicly under the `@brip` scope. Scoped packages use public access, one coordinated Changesets version set, and the `beta` dist-tag while the repository remains in prerelease mode. Stable documentation may use an unqualified package name only after an approved release moves `latest`; beta documentation and generated commands use an explicit `@beta` channel. [Publishing public scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)

### GitHub is the source and evidence channel

Every npm version is derived from one signed tag and one immutable artifact inventory. The matching GitHub Release contains release notes, tarballs or durable artifact links, SHA-256 checksums, SBOM, qualification-manifest digest, and registry/provenance verification. It is published only after npm staging, approval, finalization, and public-registry verification succeed.

### CDNs expose only the versioned browser loader

jsDelivr and unpkg examples pin an exact package version and integrity value. The loader consumes an already-issued `GlyphPayload`; it does not perform server-side scrambling and is never documented as a zero-server equivalent.

### First publication is a controlled exception

The package names must exist before npm can attach trusted-publisher and stage-only policy. A dedicated bootstrap workflow may therefore use a short-lived granular access token for the first beta only. It runs from a signed tag, behind a protected `npm-bootstrap` environment, with public access and provenance, and publishes only artifacts whose digests match the precomputed inventory. The token and bootstrap workflow are disabled or removed immediately after all packages exist and trusted publishing is configured.

### Every later publication is staged OIDC

The permanent workflow uses a GitHub-hosted runner, Node and npm versions that satisfy npm trusted-publishing requirements, `id-token: write`, a protected `npm` environment, and exact workflow identity registered for every package. npm package settings allow stage-only trusted publishing and disallow token-based publishing. Trusted publishing supplies provenance; release verification still checks it. [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)

## Child projects

| ID                   | Design                                                                                            | Size | Priority | GitHub issue                                              |
| -------------------- | ------------------------------------------------------------------------------------------------- | ---: | -------: | --------------------------------------------------------- |
| DIST-INSTALL-DX      | [Prerelease installation and channel-safe onboarding](DIST-INSTALL-DX-channel-safe-onboarding.md) |    S |       P0 | [#68](https://github.com/brip-io/glyphscramble/issues/68) |
| DIST-NPM-BOOTSTRAP   | [Bootstrap the `@brip` npm packages](DIST-NPM-BOOTSTRAP-package-bootstrap.md)                     |    S |       P0 | [#66](https://github.com/brip-io/glyphscramble/issues/66) |
| DIST-TRUSTED-RELEASE | [Protected OIDC and staged release pipeline](DIST-TRUSTED-RELEASE-staged-oidc-pipeline.md)        |    M |       P0 | [#69](https://github.com/brip-io/glyphscramble/issues/69) |
| DIST-REGISTRY-E2E    | [Public-registry consumer qualification](DIST-REGISTRY-E2E-consumer-qualification.md)             |    M |       P0 | [#67](https://github.com/brip-io/glyphscramble/issues/67) |
| DIST-OPERATIONS      | [Release, recovery, and rollback operations](DIST-OPERATIONS-release-runbook.md)                  |    S |       P0 | [#70](https://github.com/brip-io/glyphscramble/issues/70) |

## Dependency order

```text
DIST-INSTALL-DX ─▶ DIST-NPM-BOOTSTRAP ─▶ DIST-TRUSTED-RELEASE
                           │                       │
                           └───────────────────────┴─▶ DIST-REGISTRY-E2E
                                                          │
                                                          └─▶ DIST-OPERATIONS

R12 qualification + R13/R14 + counsel/IP ────────────────▶ first public beta
```

The designs and dry-run tooling may merge before the public-release gate opens. Actual package publication remains blocked on R12, R13, R14, and recorded counsel/IP approval.

## Delivery phases

1. **Make commands truthful.** Generate install commands from one channel-aware source and qualify them across npm, pnpm, Yarn, and Bun.
2. **Bootstrap ownership.** Verify npm organization access, publish the first synchronized beta through the narrow bootstrap path, and immediately retire the token.
3. **Lock the permanent path.** Configure protected GitHub environments and npm stage-only trusted publishers, then replace direct publication with prepare, stage, approve, finalize, and verify phases.
4. **Qualify the real channel.** Install the exact public beta in clean Node 22/24 consumers, run representative framework builds, and verify the documented CDN loader.
5. **Prove operations.** Have a maintainer other than the author execute the runbook and a partial-publication/compromise tabletop before stable promotion.

## Cross-cutting requirements

1. One release builds each tarball once; later jobs transfer and verify those bytes rather than repacking.
2. Every mutating step is safe to rerun and distinguishes already-correct state from conflicting state.
3. Package version, tag, npm dist-tag, GitHub Release, checksums, SBOM, qualification evidence, and provenance all identify the same release.
4. A beta never changes `latest`; stable promotion is a separately approved operation.
5. No production npm token remains after bootstrap, and no package permits token publication once stage-only trust is active.
6. A partial publication never triggers unpublish. Maintainers complete the same coordinated version when safe or deprecate it and publish a corrected version.
7. Documentation, initializer output, package readmes, and diagnostics derive channel-sensitive install commands from a shared source or a mechanically enforced contract.
8. Release workflows use least-privilege permissions, reviewed action SHAs, protected environments, and no dependency caches containing publish credentials.

## Testing and evidence

- Unit tests pin channel-to-command rendering, coordinated package selection, dist-tag policy, and idempotent registry-state decisions.
- Workflow contract tests inspect permissions, environment names, tag constraints, artifact flow, and the absence of persistent release tokens.
- Dry runs exercise prepare, bootstrap preflight, stage, finalize, partial-state resume, conflict refusal, and post-publication verification against a disposable or mocked registry boundary.
- Public-registry tests install exact versions with npm, pnpm, Yarn, and Bun on Node 22 and 24, compile documented entry points, and build representative supported frameworks.
- Release evidence records the package inventory and digest, SBOM, qualification-manifest digest, registry integrity, provenance, dist-tags, CDN integrity, and GitHub tag/release identity.

## Risks

- **Bootstrap credential exposure.** Use one short-lived granular token, protected approval, no logging or caching, provenance, and immediate revocation.
- **Partial monorepo publication.** Precompute one inventory, inspect registry state before each mutation, resume the same version only when digests match, and never overwrite.
- **Documentation/channel drift.** Generate commands centrally and test every rendered surface.
- **Approval without qualification.** Build and verify evidence before registry staging; keep public release blocked until the qualification digest is present.
- **CDN propagation delay.** Retry read-only CDN verification with a bounded window and do not advertise a URL until integrity matches.
- **Irreversible registry mistakes.** Prefer deprecation and a corrected version over unpublish; require a second maintainer for public mutations.

## Exit criteria

- A clean Node 22 or 24 machine can run `npx @brip/glyphscramble@beta init` and install the matching adapter without workspace or unpublished-package access.
- All nine public packages expose one coordinated beta version and `beta` points to it without moving `latest`.
- The bootstrap credential and workflow are retired, each package trusts only the permanent stage-only GitHub workflow, and token publication is disallowed.
- The signed tag, GitHub Release, npm packages, provenance, checksums, SBOM, qualification digest, and public-registry consumer results agree.
- A second maintainer can execute release, resume a partial failure, deprecate a bad version, and respond to credential compromise from the documented runbook.
