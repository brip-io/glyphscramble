# [R02] Static transform safety

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P0 · **Status:** Implemented in [PR #21](https://github.com/brip-io/glyphscramble/pull/21) · **GitHub issue:** [#3](https://github.com/brip-io/glyphscramble/issues/3)
> **Blocks:** R03, R10, R12

## Objective

Turn the static post-processor into an atomic, idempotent compiler for explicitly supported non-hydrated HTML and reject trees that could leak plaintext or be corrupted.

## Background

`packages/core/src/static-site.ts:52-56` recursively encodes every descendant text node, including script/style raw text. `:128-133` copies into an existing destination without replacing stale files, and `:160-176` then rewrites whatever is present. A reproduction showed that a reused destination differs from a clean build with the same seed and that JavaScript inside a marked block is corrupted. HTML-only rewriting also cannot remove plaintext from framework bundles or hydration payloads.

## Goals

- Preserve the source build and publish only complete output.
- Produce identical output from identical input/config/seed regardless of prior destination contents.
- Establish an enforceable non-hydrated support boundary.
- Prevent raw-text, metadata, interactive, and nested protection mistakes.

## Non-goals

- Transforming arbitrary React/Vue/Svelte client bundles.
- Protecting attributes, JSON-LD, feeds, or APIs implicitly.
- In-place rewriting of a deployment directory.

## Requirements

1. Static builds MUST write to a fresh sibling temporary directory and atomically replace or explicitly publish it only after all checks succeed.
2. A non-empty destination MUST either be replaced atomically or rejected; it MUST never be used as transformation input.
3. Only text nodes under an opted-in block may be encoded.
4. Protected blocks containing `script`, `style`, `noscript`, `template`, `textarea`, form controls, interactive navigation, or framework hydration markers MUST fail before output publication.
5. Nested markers MUST have deterministic documented behavior and conflicting font IDs MUST fail.
6. Unmarked HTML files MUST be copied byte-for-byte rather than parsed and serialized.
7. Supported marked HTML MUST not contain the protected plaintext after transformation.
8. A manifest MUST record source HTML hashes, transformed files, selected fonts, seed identity hash, algorithm version, and warnings without plaintext.
9. CLI and Vite/Astro documentation MUST label static support as non-hydrated unless a future framework compiler proves otherwise.

## Design

Introduce a two-phase `StaticBuildPlanner`:

1. Scan source HTML and referenced build metadata without modifying output.
2. Classify every marker as safe or reject it with file, selector/path, and reason.
3. Copy the source tree to a new temporary output.
4. Transform only the approved files from the original source bytes.
5. Emit the manifest and assets from R03.
6. Atomically rename the completed directory, with a platform-safe publish option when rename-over-existing is unavailable.

The scanner maintains a denylist of raw-text and interactive elements and pluggable hydration-marker detectors for Astro, React, Vue, and Svelte output. Detection is a refusal mechanism, not a claim that unknown frameworks are safe.

## Scope

- `packages/core/src/static-site.ts`
- new `packages/core/src/static-plan.ts`
- CLI diagnostics and result types
- static fixture corpus under `packages/core/test/fixtures/static/`
- static documentation

## Testing strategy

- Idempotency: clean output and reused-destination invocation yield the same published bytes.
- Atomicity: injected failures leave the prior published directory untouched.
- Raw-text fixtures prove scripts/styles are never modified and cause a clear failure.
- Hydration fixtures for React/Vue/Svelte/Astro islands fail closed.
- Byte-preservation tests for every unmarked HTML and non-HTML asset.
- Plaintext scanning across emitted HTML and declared supported artifacts.

## Risks

- Atomic directory replacement differs across platforms and deployment systems.
- Hydration detection cannot prove safety for unknown generators; unknown markers should be conservative.

## Exit criteria

Static output is deterministic and atomic, unsafe or hydrated marked content fails before publication, unmarked files remain byte-identical, and the source build is always recoverable.

## Implementation notes

`StaticBuildPlanner` walks a sorted source tree, rejects symlinks and lexical or
canonical input/output overlap, hashes every source HTML file, and classifies
only actual `data-glyphscramble-font` elements for transformation. Built-in and
custom hydration detectors operate on safe element snapshots. Unsafe elements,
interactive ancestors, comments, plaintext-bearing attributes, and ambiguous
nested fonts report the source file and DOM path.

`buildStaticSite` prepares only fonts selected by the plan, copies verified
source bytes into a fresh sibling staging directory, transforms marked HTML
from the original bytes, emits a deterministic plaintext-free manifest, and
then swaps the completed tree into place with rollback. Existing output can be
replaced or explicitly rejected. Same-font nested markers compile once and are
recorded as warnings. Unknown non-structural Unicode values now fail closed
instead of passing through unchanged.
