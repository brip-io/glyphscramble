# Changelog

## Unreleased

- Move response-specific WOFF2 generation into a bounded one-use worker pool so protected requests perform only token validation and lookup, while overload, expiry, restart, and capacity failures remain closed and observable without content telemetry.
- Prepare explicit named font faces from structured CSS, enforce Unicode coverage, preserve license notices, and carry verified descriptors and source identities through dynamic and static delivery.
- Bound remote font ingestion and harden SFNT, WOFF, WOFF2, and `cmap` validation; pin reproducible Unicode 17 classification so malformed or oversized build inputs fail closed.

## 0.1.0-beta.0

- Initial core, CLI, per-response request engine, static post-build generator, and React/Next, Vue/Nuxt, Svelte/SvelteKit, Astro/Vite integration contracts.
- The beta is not a public-release claim: complex-script visual qualification, legal review, and signed release approval remain required gates.
