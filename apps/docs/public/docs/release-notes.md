# Release notes

Review public package changes and the current beta qualification boundary.

Source: https://glyphscramble.brip.io/docs/release-notes/

GlyphScramble packages share one intentionally compatible version. Prereleases publish only under npm's `beta` dist-tag; stable releases alone may move `latest`.

## Current release

### 0.1.0-beta.0
- Initial core, CLI, per-response request engine, static post-build generator, and React/Next, Vue/Nuxt, Svelte/SvelteKit, Astro/Vite integration contracts.
- The beta is not a public-release claim: complex-script visual qualification, legal review, and signed release approval remain required gates.

## Evidence

Every public release must correspond to an exact signed Git tag and attach checksums, package inventory, an SPDX SBOM, and a qualification-manifest digest. npm provenance and downloaded archive digests are verified after publication.

A missing qualification digest means rehearsal only. Public beta remains blocked until R12 records browser, framework, leakage, performance, package, documentation, demo, and counsel/IP gates.

See the repository [CHANGELOG](https://github.com/brip-io/glyphscramble/blob/main/CHANGELOG.md) for the complete unreleased history and [Distribution](/docs/operations/caching-cdn/) for immutable channel and rollback policy.
