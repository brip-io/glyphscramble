# [DIST-INSTALL-DX] Prerelease installation and channel-safe onboarding

> **Parent:** [DIST-RELEASE](DIST-RELEASE-package-release-delivery.md) · **Size:** S · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#68](https://github.com/brip-io/glyphscramble/issues/68)
> **Blocked by:** R15 package and initializer contracts · **Blocks:** DIST-NPM-BOOTSTRAP and DIST-REGISTRY-E2E

## Objective

Make every beta installation command resolve the intended prerelease and ensure the initializer installs a compatible adapter from the same release channel.

## Background

The release policy publishes prereleases only under npm's `beta` dist-tag and deliberately leaves `latest` unchanged. Current beta-facing README, distribution guide, package readmes, framework quickstarts, and CLI diagnostics contain unqualified commands such as `npx @brip/glyphscramble init`. Before a stable `latest` exists, those commands do not resolve. Hand-maintained variants also risk drifting across package managers and the R13 site.

## Design

Introduce one channel-aware install-command model with at least `beta`, exact version, and stable modes. It generates equivalent commands for npm/npx, pnpm/pnpm dlx, Yarn/yarn dlx, and Bun/bunx and can render both the core CLI command and framework-adapter dependency commands.

While the repository is in Changesets prerelease mode:

- public beta docs use `@beta` for discovery-oriented commands;
- release evidence and reproducible CI examples use an exact version;
- the initializer installs the detected adapter at the running CLI's exact version when invoked from an exact release, or at `beta` when invoked through `@beta` and an exact self-version cannot be established safely;
- an unqualified command is permitted only on content explicitly marked for the future stable channel.

The shared model feeds root and package readmes, `docs/DISTRIBUTION.md`, generated quickstart data, initializer output, and `doctor` repair commands. R13 consumes this model after its branch merges; this issue must not duplicate or overwrite R13's documentation registry.

## Scope

- Add a typed channel/version command generator in a package-independent build or documentation utility.
- Replace beta-facing unqualified commands in the root README, distribution guide, package readmes, and current CLI diagnostics.
- Make adapter installation channel-compatible and reject an unknowable or incompatible cross-channel selection rather than silently choosing `latest`.
- Document the distinction between `@beta`, exact versions, and the future stable command.
- Add a mechanical check that prevents new unqualified beta install commands on governed surfaces.

## Non-goals

- Publishing packages or configuring npm permissions.
- Rebuilding the R13 documentation site.
- Making prerelease ranges float across incompatible beta versions.
- Supporting global installation as the recommended path.

## Testing

- Snapshot command generation for every package manager, channel, and adapter.
- Run initializer consumer tests with an exact beta CLI and assert the adapter uses the same exact version.
- Run beta-tag scenarios against a mock package manager and assert no command falls back to `latest`.
- Scan governed Markdown and generated diagnostics for disallowed unqualified commands.
- Keep the existing npm, pnpm, Yarn, and Bun packed-consumer matrix green.

## Risks

- Exact-version coupling can fail in source checkouts that have no published version. Source fixtures use explicit test overrides and never leak them into generated user files.
- A blanket text replacement could corrupt stable or conceptual prose. The check applies only to executable install-command surfaces and uses parsed command fixtures where possible.
- R13 may change the documentation source of truth concurrently. Integrate through its canonical command data after merge rather than editing the same generated pages independently.

## Exit criteria

A beta user can copy any documented npm, pnpm, Yarn, or Bun command and receive the beta CLI plus a compatible adapter; tests fail if a governed beta surface points implicitly at `latest` or the initializer creates a cross-version installation.
