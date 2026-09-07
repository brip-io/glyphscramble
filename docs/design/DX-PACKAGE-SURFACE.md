# [DX-PACKAGE-SURFACE] Coherent package and installation contract

> Child of [DX-INSTRUMENTATION](DX-INSTRUMENTATION.md) — milestone **M1**.
>
> **Size:** M · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#79](https://github.com/brip-io/glyphscramble/issues/79)
> **Blocked by:** R15 · **Blocks:** DX-PAYLOAD-RENDERERS and DIST-INSTALL-DX #68

## Objective

Make core plus one platform adapter sufficient for every full-stack integration and enforce one compatible beta version across installed, generated, packed, and published packages.

## Scope

- Add all nine release packages to one Changesets fixed group and publish exact internal versions instead of compatible ranges during beta.
- Define one typed application-to-direct-dependency matrix consumed by `init`, documentation, diagnostics, and consumer tests.
- Re-export the platform renderer and commonly used payload/config types from Next, Nuxt, SvelteKit, and Astro entry points.
- Fix SvelteKit so generated examples never import an undeclared transitive renderer.
- Keep core directly installed because it owns the local CLI and generated config.
- Correct the version-3 documentation drift and align package readmes with DIST-INSTALL-DX's channel renderer.
- Replace the decisive all-nine consumer smoke with minimal package-set fixtures for each supported application shape under npm, pnpm, Yarn, and Bun.

## Requirements

1. A full-stack application MUST import only core and its selected platform adapter directly.
2. `init --dry-run` MUST report the exact same dependency set that real initialization installs.
3. Platform examples MUST build when no undeclared `@brip/glyphscramble*` package is visible at the application root.
4. Changesets and artifact preparation MUST agree on one beta version for all nine packages.
5. Packed internal dependencies MUST resolve to that exact version and MUST NOT float to stable or another beta.
6. Standalone React, Vue, and Svelte integrations MAY continue to install core plus the corresponding UI renderer.
7. Package-manager fixtures MUST fail if an example succeeds only because every workspace package was installed together.

## Deliverables

- Shared package/install manifest and generated command inputs.
- Updated package exports, manifests, initializer selection, examples, and readmes.
- Hermetic packed-consumer fixtures for each documented installation shape.
- Changeset describing the beta dependency and export contract.

## Testing strategy

- Run minimal installs from tarballs with isolated stores and no workspace configuration.
- Compile every documented import and execute `glyphscramble --version`, `prepare`, and `doctor` from the local core binary.
- Test missing renderer, mixed version, incompatible peer, absent binary, and accidental transitive import failures.
- Run `changeset status` and inspect packed manifests for one coordinated version and exact internal dependencies.

## Risks

- Lockstep publishing produces adapter releases without code changes; this is accepted during beta for compatibility.
- Re-exports can create browser/server condition mistakes. Consumer fixtures compile and execute every public path in its intended environment.
- DIST-INSTALL-DX changes the same initializer/docs area. This issue lands first and #68 consumes its manifest rather than duplicating it.

## Exit criteria

Every supported application installs its documented minimal package set from tarballs with all four package managers, builds without workspace or undeclared dependency access, and resolves one exact compatible beta version across the package graph.
