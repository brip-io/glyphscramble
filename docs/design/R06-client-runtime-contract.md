# [R06] Client payload and font-load lifecycle

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #25](https://github.com/brip-io/glyphscramble/pull/25) · **GitHub issue:** [#7](https://github.com/brip-io/glyphscramble/issues/7)
> **Blocked by:** R04, R05 · **Blocks:** R03, R07-R10, R12

## Objective

Provide one validated, CSP-compatible client runtime that registers exact faces, reveals safely, updates reactively, and cleans up without trusting arbitrary CSS from serialized payloads.

## Background

`packages/core/src/browser.ts:17-49` appends a new style on every call, trusts `payload.css`, leaves timers/rules behind, and checks a different font query from the one it loads. React and Svelte do not cancel work on unmount; Vue does not react to payload updates. Astro has a separate weaker loader.

## Goals

- Make `GlyphPayload` safe to accept at a runtime serialization boundary.
- Share exact load/reveal/failure semantics across every adapter and static mode.
- Avoid stale styles, timers, requests, and detached-element mutation.
- Support strict CSP without serializing arbitrary CSS.

## Non-goals

- Authenticating application data generally.
- Shipping plaintext fallbacks or accessibility mirrors.
- Supporting legacy browsers without `FontFaceSet`/`document.fonts`.

## Requirements

1. The wire payload MUST contain data fields only; arbitrary CSS text MUST be removed.
2. Runtime validation MUST check version, family/face descriptors, font URL policy, encoded text, coverage, optional nonce, and payload size limits.
3. A shared registry MUST deduplicate `FontFace` registration and loads by immutable face identity.
4. Reveal MUST wait for the exact descriptor and representative encoded text and verify a successful load result.
5. Mount operations MUST return a cleanup/abort handle and ignore completion after unmount or superseding updates.
6. Timers, generated rules/faces, and registry entries MUST have bounded lifecycle and reference counting.
7. Failure MUST show a generic visible state while keeping protected encoded text out of the accessibility tree.
8. Language and face descriptors from R04 MUST be applied to the rendered element.
9. CSP helpers MUST document required `font-src`, style, script, and nonce/hash behavior.
10. The runtime MUST not phone home, log content, or add BRIP branding.

## Design

Replace `payload.css` with a versioned payload containing `face: { family, weight, style, stretch }`, `fontUrl`, encoded text, coverage identity, and optional nonce metadata. `assertGlyphPayload()` validates unknown values before use.

`mountGlyphPayload(element, payload, options)` creates or reuses a `FontFace`, adds it to `document.fonts`, races exact loading with an abortable timeout, then transitions the element through `loading`, `ready`, or `error`. It returns `{ update, destroy, ready }`. Framework adapters wrap this lifecycle rather than reimplementing it.

## Scope

- `packages/core/src/types.ts`
- `packages/core/src/browser.ts`
- payload construction in `packages/core/src/engine.ts`
- React/Vue/Svelte/Astro wrappers
- CSP and client-runtime documentation

## Testing strategy

- Runtime schema/property tests against malformed and oversized payloads.
- Mount/update/destroy tests with fake timers and mocked `FontFaceSet`.
- Browser tests for duplicate components, strict mode, rapid navigation, failed/slow fonts, and CSP.
- DOM/style/font registry leak assertions after repeated navigation.
- Accessibility-tree assertions for loading, ready, error, and teardown states.

## Risks

- `FontFace` lifecycle/removal behavior differs slightly across browsers; reference counting must be conservative.
- CSP support may require a stylesheet mode on browsers/environments where constructed faces are restricted.

## Exit criteria

All adapters consume one validated data-only payload and shared lifecycle; repeated updates and navigation reveal only after the exact face loads and leave no stale rules, timers, or accessible encoded text.

## Implementation evidence

[PR #25](https://github.com/brip-io/glyphscramble/pull/25) introduces the
data-only v2 payload, bounded runtime validation, root-relative token/face-bound
font URLs, exact `FontFace` registration and verification, reference-counted
cleanup, abortable update/destroy handles, nonce-scoped CSP rules, and shared
React, Vue, Svelte, and Astro adapters.

Unit coverage exercises malformed and oversized payloads, descriptor and
coverage invariants, deduplication, timeout, exact-face failure, rapid updates,
teardown, and CSP helpers. Playwright runs duplicate mounts, strict CSP, stale
navigation-style updates, font failure, and accessibility-state assertions in
Chromium, Firefox, and WebKit CI projects.
