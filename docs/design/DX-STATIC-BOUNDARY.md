# [DX-STATIC-BOUNDARY] Static existing-component boundary

> Child of [DX-INSTRUMENTATION](DX-INSTRUMENTATION.md) — milestone **M3**.
>
> **Size:** M · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** [#78](https://github.com/brip-io/glyphscramble/issues/78)
> **Blocked by:** DX-PAYLOAD-RENDERERS and R02/R03 · **Blocks:** DX-RESPONSE-BOUNDARY and DX-COMPILER-SPIKE

## Objective

Let authors wrap an existing non-hydrated presentational component and have every safe descendant text node transformed by the existing static compiler before publication.

## Public contract

Framework packages that can emit static HTML expose an explicitly named boundary:

```tsx
<GlyphStaticBoundary font="body" as="section">
  <ExistingResearchCard />
</GlyphStaticBoundary>
```

It emits a normal wrapper carrying `data-glyphscramble-font` and versioned source metadata. It performs no browser-time encoding. The existing two-tree static compiler remains the only transformation and publication authority.

## Scope

- Extract reusable marker/type helpers and add Astro plus framework-neutral boundary fixtures; add React/Vue/Svelte exports only where output is genuinely non-hydrated.
- Extend static planning with one-face subtree typography rules and actionable font-override diagnostics.
- Force the generated mapped family across every descendant text container while allowing documented size, spacing, color, and limited synthesized emphasis.
- Preserve component markup and unmarked assets; reject interactive elements, client islands, hydration markers, plaintext attributes, comments containing protected text, nested different-font boundaries, and unsupported content.
- Report protected text-node/element counts plus SEO and accessibility warnings in `doctor` and the static manifest.
- Add canonical usage examples that wrap a real nested research-card component rather than a hand-written text-only element.

## Requirements

1. Published HTML and generated assets MUST contain no protected source text.
2. The boundary MUST support exactly one configured face in its first release and MUST refuse incompatible nested typography rather than rendering scrambled glyphs.
3. Component CSS MUST NOT be able to restore an ordinary font inside the protected subtree unnoticed.
4. Source and prior published trees MUST remain recoverable after any planning, transformation, font, or verification failure.
5. Hydrated or interactive output MUST fail before destination replacement.
6. Static output MUST retain per-build rotation and content-addressed public caching; documentation MUST not imply per-response protection.

## Testing strategy

- Use real nested Astro and framework-neutral components with paragraphs, tables, RTL, combining marks, emoji, whitespace, emphasis, and deep markup.
- Add CSS cascade tests for descendant classes, inline font overrides, inherited family, weight/style changes, and font-load verification.
- Assert rejection of every current unsafe element/attribute/hydration class through boundary-generated output.
- Compare original and transformed screenshots in Chromium, Firefox, and WebKit and test no-JS/CSP/font-failure behavior.
- Rebuild deterministically with a fixed seed and prove fresh random builds differ.

## Risks

- Forcing one face can flatten component typography. The boundary is for visually simple high-value blocks; unsupported styling fails or is explicitly documented as synthesized.
- Framework components can emit markup not visible from source. Validation occurs on final generated HTML, not component syntax.
- A generic name could imply hydrated support. `Static` remains in the public component and diagnostic names.

## Exit criteria

A real non-hydrated research-card component can be wrapped with one boundary, compiled and published without plaintext, and rendered pixel-equivalently within approved tolerances; unsafe, hydrated, or typography-incompatible output fails before publication.
