# [DIST-TRUSTED-RELEASE] Protected OIDC and staged release pipeline

> **Parent:** [DIST-RELEASE](DIST-RELEASE-package-release-delivery.md) · **Size:** M · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#69](https://github.com/brip-io/glyphscramble/issues/69)
> **Blocked by:** DIST-NPM-BOOTSTRAP · **Blocks:** DIST-REGISTRY-E2E and routine public releases

## Objective

Replace the post-release, sequential publication flow with a build-once, qualify-first, stage-only npm release pipeline authenticated by GitHub Actions OIDC and safe to resume after partial failure.

## Background

The existing workflow starts only after a GitHub Release has already been published, directly loops over `npm publish`, and uploads evidence after registry mutation. If one of nine publishes and a later step fails, the workflow has no explicit resume contract. The repository references an `npm` environment, but no such environment is configured yet. GitHub would otherwise create an unprotected environment automatically on first use.

npm trusted publishing supports GitHub Actions OIDC on GitHub-hosted runners and automatically supplies provenance. npm recommends stage-only trusted publishing plus disabling token publication for the strongest control. GitHub environments can hold required reviewers, prevent self-review, and delay access to environment secrets and variables until approval. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

## Design

### Phase 1: prepare and qualify

From an exact signed tag, a least-privilege workflow checks out the tag, installs with the lockfile, runs the R12 release gates, computes the Changesets release version, packs all nine packages once, and emits one immutable release bundle:

- package tarballs and name/version/digest inventory;
- checksums and SPDX or CycloneDX SBOM;
- qualification manifest and digest;
- generated release notes and channel decision;
- browser-loader files and exact integrity metadata.

The artifact bundle is retained and passed to later jobs without rebuilding. A draft GitHub Release may expose progress to maintainers, but it is not published to users yet.

### Phase 2: stage with OIDC

The `npm-stage` job uses `id-token: write`, a GitHub-hosted runner, the protected `npm` environment, and Node/npm versions accepted by npm trusted publishing. Every package registers the exact organization, repository, workflow filename, and environment as a stage-only trusted publisher. Token publishing is disabled in npm package settings.

The job verifies the bundle, inspects current registry/staging state, and runs `npm stage publish` only for absent matching candidates. It refuses version or integrity conflicts. No `NPM_TOKEN` or reusable publish secret exists.

### Phase 3: approve and finalize

A release maintainer reviews the qualification evidence and staged package set, then approves the staged publications using npm's required strong authentication. Finalization preserves the selected `beta` or stable dist-tag contract and emits machine-readable results.

### Phase 4: verify and announce

A read-only job downloads every package from npm, verifies integrity, provenance, versions, dist-tags, metadata, and the public loader. Only after verification succeeds does it publish the GitHub Release and its complete evidence. Failure leaves the GitHub Release draft and produces an actionable resume report.

### Resume semantics

Every phase records package state by name, version, expected digest, stage status, and public registry status. A rerun skips an already-correct state, completes a pending state, and fails on conflict. It never generates a second artifact for the same tag or overwrites a published version.

## Scope

- Refactor `.github/workflows/release.yml` or split it into clearly named prepare, stage, finalize, and verify workflows.
- Add idempotent publish-state orchestration around the existing artifact and registry verification scripts.
- Configure protected `npm` environment policy and document the corresponding per-package npm trusted-publisher settings.
- Pin release Actions and constrain workflow permissions, refs, concurrency, and artifact retention.
- Publish the GitHub Release only after registry verification.

## Non-goals

- Automating the human npm staged-publication approval away.
- Allowing branch, pull-request, or unsigned arbitrary-version publication.
- Repacking after qualification or rebuilding separately for npm and GitHub.
- Deleting a public version to repair a release.

## Testing

- Contract-test workflow triggers, permissions, environments, concurrency, artifact lineage, and forbidden secrets.
- Unit-test the release state machine across clean, staged, approved, partially public, matching rerun, and conflicting states.
- Verify beta never changes `latest` and stable promotion requires an explicit approved channel decision.
- Exercise prepare and verification locally against packed artifacts; exercise staging against a disposable prerelease package after bootstrap.
- Tamper with one artifact, inventory field, qualification digest, provenance result, and dist-tag in failure tests.
- Rehearse cancellation and rerun after each mutating boundary.

## Risks

- A configuration mismatch between nine package trusted publishers can fail mid-release. Add a preflight checklist and make state inspection/resume first-class.
- npm staged approval remains an external manual step. Keep GitHub artifacts and draft release durable, surface the exact next command, and allow safe delayed continuation.
- Publishing GitHub notes before npm verification creates false availability. Keep the release draft until all registry checks pass.
- Floating Actions or cached credentials weaken provenance. Pin reviewed SHAs and never cache authentication material.

## Exit criteria

A signed qualified tag can be prepared once, staged for all nine packages without an npm token, approved and finalized under protected review, verified from the public registry, and then announced through one matching GitHub Release. The pipeline can resume every documented partial state and refuses conflicting bytes or channels.
