# [R03] Static delivery, caching, CSP, and accessibility

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #27](https://github.com/brip-io/glyphscramble/pull/27) · **GitHub issue:** [#4](https://github.com/brip-io/glyphscramble/issues/4)
> **Blocked by:** R02, R04, R06 · **Blocks:** R10, R12

## Objective

Make supported static output safe to deploy under real CDN, subpath, CSP, font-failure, and accessibility conditions.

## Background

`packages/core/src/static-site.ts:73-99` hardcodes root-relative `/_glyphscramble` URLs. Font filenames at `:144-150` exclude source-font and algorithm hashes, while CSS and JavaScript use stable names at `:179-192`. The build hides content visually with `visibility:hidden` but never adds `aria-hidden`, contradicting the documented static accessibility behavior.

## Goals

- Content-address every generated asset and make builds safe to cache for a long lifetime.
- Support root and subpath deployments.
- Keep protected content out of the accessibility tree without creating a plaintext mirror.
- Provide deterministic fail-closed behavior under CSP or font failure.

## Non-goals

- Making protected blocks WCAG-conformant.
- Serving generated assets from BRIP infrastructure.
- Runtime telemetry or injected branding.

## Requirements

1. Every font, CSS, JavaScript, and manifest filename MUST include a digest of its emitted bytes.
2. Font identity MUST cover prepared-font SHA-256, mapping seed identity, algorithm version, face descriptors, and coverage.
3. Asset URLs MUST honor a configured public base path and work from nested HTML paths.
4. Generated HTML MUST mark protected content `aria-hidden="true"` before it reaches a browser.
5. A generic failure status MUST be available to assistive technology without exposing protected plaintext.
6. The loader MUST reveal only after the exact face/text load succeeds and MUST time out to a visible generic error.
7. CSP documentation and helpers MUST cover external script/style/font sources, nonces or hashes, and `font-src`.
8. Output MUST include font license/notice files from R04.
9. The manifest MUST support an atomic-deployment check that rejects HTML/assets from different builds.
10. Cache guidance MUST distinguish immutable hashed assets from HTML and the build manifest.

## Design

R03 consumes R02's build plan and R06's shared loader behavior. It emits assets to a digest-named directory and injects manifest-derived URLs into only transformed documents. The static loader uses classes/data attributes rather than arbitrary inline style text where CSP would block it. Failure UI is a separate generic status node; protected encoded content remains `aria-hidden` in every state.

The deployment manifest includes a build ID and asset graph. A `glyphscramble doctor --static-output` command verifies that every transformed document references exactly one matching manifest and that all assets exist with the expected hashes.

## Scope

- `packages/core/src/static-site.ts`
- static loader generation shared with `packages/core/src/browser.ts`
- config/types for public base path and failure policy
- `glyphscramble doctor --static-output`
- static deployment documentation and examples

## Testing strategy

- Root, `/docs/`, and nested-route URL fixtures.
- Two-build CDN simulation proving no stale CSS/font pairing.
- CSP browser tests with strict `default-src 'none'` plus minimal required directives.
- Accessibility-tree assertions before load, after success, and after failure.
- Font 404, corrupt font, blocked CSS/JS, and timeout tests.
- Manifest/hash tamper and mixed-build rejection tests.

## Implementation evidence

[PR #27](https://github.com/brip-io/glyphscramble/pull/27) introduces the
version-2 static asset graph and deployment contract:

- font, CSS, JavaScript, and manifest filenames carry SHA-256 byte identities
  below a build-ID directory; font identities additionally bind the prepared
  face, seed identity, algorithm, descriptors, and coverage;
- configured root/subpath URLs are injected into transformed pages, while
  native `hidden` plus persistent `aria-hidden` prevents a CSS or JavaScript
  failure from exposing encoded text;
- a strict-CSP external loader verifies the exact computed face and full text,
  times out, and reveals only a separate generic live status on failure;
- `doctor --static-output` checks manifest naming, build identity, asset bytes,
  transformed-page references, and mixed-build output trees;
- unit tests cover reproducibility, rotation, subpaths, tampering, mixed builds,
  and configuration bounds; Playwright qualifies success, missing/corrupt
  fonts, and blocked CSS/JavaScript in Chromium, Firefox, and WebKit.

## Risks

- Generic accessible failure UI must not become a plaintext mirror.
- Some static hosts cannot atomically swap directories; deployment documentation must prescribe versioned prefixes.

## Exit criteria

A versioned static build works from root and subpaths, survives long-lived asset caching, exposes no scrambled text to the accessibility tree, and fails visibly and generically under CSP/font errors without mixing build generations.
