# [DX-PAYLOAD-RENDERERS] Explicit and consistent payload renderers

> Child of [DX-INSTRUMENTATION](DX-INSTRUMENTATION.md) — milestone **M2**.
>
> **Size:** S · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** [#82](https://github.com/brip-io/glyphscramble/issues/82)
> **Blocked by:** DX-PACKAGE-SURFACE · **Blocks:** DX-STATIC-BOUNDARY

## Objective

Give every framework the same unmistakably payload-only leaf component and prevent polymorphic rendering from bypassing its required DOM lifecycle.

## Scope

- Export `GlyphText` as the canonical leaf renderer from React, Next, Vue, Nuxt, Svelte, SvelteKit, and Astro surfaces.
- Retain `GlyphScramble` as a documented compatibility alias during beta unless a reviewed Changeset chooses a direct rename.
- Accept only `GlyphPayload`, intrinsic element selection where supported, `fontTimeoutMs`, `errorText`, and ordinary safe element attributes.
- Restrict React `as` from arbitrary `ElementType` to intrinsic elements whose ref and lifecycle properties are controlled.
- Keep children/slots/snippets unavailable on the payload renderer and produce clear type errors that point to `GlyphStaticBoundary` for safe subtree use.
- Run the existing shared browser mount lifecycle through each adapter and align prop naming where framework conventions permit.

## Requirements

1. Plaintext children MUST fail type/build checks on every component surface.
2. An arbitrary custom component MUST NOT be accepted through `as` unless a future contract proves ref and attribute forwarding.
3. Every platform adapter MUST expose its renderer without requiring a direct import from an internal UI package.
4. Equivalent payload updates MUST remain no-ops; replacement payloads MUST hide until the exact replacement face loads.
5. Generic failure output MUST never accept or derive from the protected source.

## Testing strategy

- Add shared positive and negative type fixtures for payload, children, `as`, timeouts, and errors.
- Exercise load success/failure, update, expiry, unmount, remount, CSP, and cleanup in real browser adapters.
- Compile the canonical example only through each platform adapter's public exports.

## Risks

- Renaming creates needless migration cost. Keep the current name as an alias and change examples first.
- Intrinsic-element types differ across frameworks. Share behavior and vocabulary, not an artificial identical type implementation.

## Exit criteria

Every adapter exposes one clearly named payload-only renderer with no plaintext-child or opaque-custom-component path, and the shared lifecycle and negative type suites pass across all supported frameworks.
