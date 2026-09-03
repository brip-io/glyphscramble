# Changelog

## Unreleased

- Add a request-scoped Next 16 App Router integration with direct-navigation, RSC leakage, rotation, expiry refresh, selective caching, and GET/HEAD consumer coverage; generated routes now respect Next private-folder and Cache Components rules, independently bundled server modules share one process-local engine, TypeScript configs load across the supported Node lines, and React avoids equivalent-payload remounts behind explicit server-only boundaries.
- Emit static fonts, CSS, JavaScript, and manifests under byte-derived build identities; add subpath-safe URLs, a strict-CSP fail-closed loader, persistent `aria-hidden` protection, generic accessible failure status, and deployment verification so stale CDN assets cannot silently pair with newer HTML.
- Replace serialized payload CSS with a validated data-only contract and one reference-counted client lifecycle so exact font loads, reactive updates, CSP nonces, failures, and unmount cleanup behave consistently across framework adapters; precompute stable Unicode property groups so response rotation does not repeatedly classify the same face.
- Bind encrypted tokens to validated lifetimes, rotating key IDs, prepared variants, and only the faces used by a response; malformed and unauthorized font requests now fail cheaply while unprotected framework responses retain their cache policy.
- Compile static protection through a validated fresh-tree plan and transactional publish so unsafe, hydrated, stale-output, and unmappable content fails without changing the source or prior deployment.
- Move response-specific WOFF2 generation into a bounded one-use worker pool so protected requests perform only token validation and lookup, while overload, expiry, restart, and capacity failures remain closed and observable without content telemetry.
- Prepare explicit named font faces from structured CSS, enforce Unicode coverage, preserve license notices, and carry verified descriptors and source identities through dynamic and static delivery.
- Bound remote font ingestion and harden SFNT, WOFF, WOFF2, and `cmap` validation; pin reproducible Unicode 17 classification so malformed or oversized build inputs fail closed.

## 0.1.0-beta.0

- Initial core, CLI, per-response request engine, static post-build generator, and React/Next, Vue/Nuxt, Svelte/SvelteKit, Astro/Vite integration contracts.
- The beta is not a public-release claim: complex-script visual qualification, legal review, and signed release approval remain required gates.
