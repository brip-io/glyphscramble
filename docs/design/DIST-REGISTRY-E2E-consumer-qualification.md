# [DIST-REGISTRY-E2E] Public-registry consumer qualification

> **Parent:** [DIST-RELEASE](DIST-RELEASE-package-release-delivery.md) · **Size:** M · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#67](https://github.com/brip-io/glyphscramble/issues/67)
> **Blocked by:** DIST-NPM-BOOTSTRAP and DIST-TRUSTED-RELEASE · **Blocks:** DIST-OPERATIONS and public availability claims

## Objective

Prove that the exact released beta works for developers outside the monorepo when installed from npm and, for the browser loader only, from documented version-pinned CDNs.

## Background

The existing package-manager matrix installs local tarballs with npm, pnpm, Yarn, and Bun. This is valuable packaging validation but cannot detect npm access, dist-tag, provenance, registry metadata, README, CDN, or real resolution failures. A public package is not ready merely because `npm pack` worked in its source repository.

## Design

After staged publication is finalized, a clean post-publication workflow creates temporary consumers with no workspace links, pnpm store reuse, repository `.npmrc`, or unpublished package paths. It resolves the coordinated release in two ways:

- `@beta`, proving the documented discovery command and beta dist-tag;
- exact version, proving reproducible installation and evidence identity.

The matrix covers Node 22 and 24 and npm, pnpm, Yarn, and Bun. A small package-manager smoke consumer installs all nine packages and imports every public entry point. Representative framework fixtures then run the generated `init` path and production build for Next, Nuxt, SvelteKit, Astro, and Vite/vanilla boundaries owned by R07-R10.

The tests verify:

- CLI execution and `--version` from the registry package;
- framework peer and adapter resolution with no cross-version packages;
- declarations, ESM exports, browser/server conditions, binary entry, and `files` allowlist behavior;
- package descriptions, repository links, license, readmes, engine floor, deprecation state, and public access;
- provenance and registry integrity against the release inventory;
- `beta` and `latest` channel invariants;
- exact-version jsDelivr and unpkg browser-loader bytes plus integrity, after bounded propagation retries.

Failures after publication block the GitHub Release announcement and produce a package/framework-specific repair report. They do not trigger unpublish.

## Scope

- Extend the packed-consumer harness with a public-registry mode and hermetic configuration.
- Add Node/package-manager and representative framework matrices at an economical CI depth.
- Verify registry metadata, provenance, dist-tags, coordinated versions, and release inventory.
- Verify both documented CDN providers for the loader only.
- Attach results and environment versions to release evidence.

## Non-goals

- Testing every framework version on every package manager in every release job; deeper peer-range coverage stays in regular qualification.
- Treating CDN availability as required for server or adapter packages.
- Retrying indefinitely or masking a registry/CDN mismatch as propagation delay.
- Claiming public support for a framework that has not passed R12 qualification.

## Testing

- Self-test hermetic consumers by failing if workspace protocols, local paths, repository auth, or shared install stores are available.
- Inject registry 404, wrong dist-tag, mixed package versions, corrupt tarball, missing provenance, metadata drift, peer conflict, and CDN mismatch.
- Pin bounded CDN retry duration and preserve the first and final observed state in evidence.
- Run one exact-version reinstall after cache removal to prove the result is reproducible.
- Keep a local/mock mode so pull requests can validate orchestration without depending on a public version.

## Performance budget

Public-registry qualification should add no more than one small install smoke per package manager plus representative framework builds already required for release. Matrices should share immutable downloaded artifacts where that does not compromise the hermetic-resolution assertion and use explicit timeouts for registries, package managers, and CDNs.

## Risks

- Registry or CDN outages can block announcement after publication. Preserve the draft release and rerun read-only verification; do not rebuild or republish.
- An overly broad matrix can make releases impractically slow. Use one axis for package-manager resolution and a separate representative framework axis.
- Shared caches can hide missing public dependencies. Run the decisive qualification with clean stores and no repository configuration.

## Exit criteria

Clean Node 22/24 consumers install the exact coordinated beta and the `beta` channel through all four supported package managers, all public entry points and representative framework builds succeed without workspace access, registry/provenance metadata matches the release inventory, and both documented exact-version loader URLs pass integrity verification.
