# [R04] Font-face resolution, coverage, and licensing

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented ([PR #15](https://github.com/brip-io/glyphscramble/pull/15)) · **GitHub issue:** [#5](https://github.com/brip-io/glyphscramble/issues/5)
> **Blocks:** R01, R03, R07-R12

## Objective

Prepare deterministic, bounded, correctly described font faces from local files, direct URLs, and multi-face CSS while preserving licenses and shaping-critical data.

## Background

`packages/core/src/font-pipeline.ts:93-104` selects only the first `url(...)` from CSS. `:187-205` records configured coverage but neither applies it nor lets it satisfy the large-face rule. Runtime CSS omits weight, style, stretch, and variation descriptors. `ensureLicenseDirectory()` exists at `:263-272` but is never invoked.

## Goals

- Treat a CSS source as a set of explicit faces and Unicode subsets.
- Give coverage configuration enforceable semantics.
- Produce reproducible lock data that distinguishes raw and normalized inputs.
- Preserve and emit font notices with every redistributed artifact.

## Non-goals

- Deciding whether a user's font license legally permits modification.
- Combining unrelated families into one logical face.
- Lossy high-level font rebuilding.

## Requirements

1. CSS MUST be parsed with a standards-aware parser, not a global `url(...)` regex.
2. Face metadata MUST include family/name IDs, weight, style, stretch, axes, features, Unicode range, source format, and outline flavor.
3. Google Fonts responses MUST use an explicit supported request profile and preserve all selected face descriptors/subsets.
4. Configuration MUST let users select faces and coverage unambiguously; ambiguous multi-face input MUST fail with actionable choices.
5. Configured coverage MUST be validated against the source and actually constrain prepared artifacts or permutation coverage.
6. Faces above the normalized limit MUST require effective coverage/subsetting or an explicit override; a metadata-only coverage string is insufficient.
7. Lockfiles MUST contain original source URL, final URL, raw SHA-256, normalized SHA-256, source descriptors, selected coverage, and tool/Unicode versions.
8. Preparation MUST be transactional and deterministic apart from an explicitly documented timestamp field.
9. License expressions MUST be syntactically validated and notice bytes copied into prepared and static artifacts.
10. Runtime `@font-face` declarations MUST reproduce the selected descriptors.

## Design

Replace the one-config-entry/one-byte-file assumption with `PreparedFamily` containing named `PreparedFace` records. CSS resolution yields candidate `@font-face` rules; configuration selects one or more by weight/style/stretch/range. Each prepared face has a stable ID derived from normalized identity and descriptors.

Coverage becomes an input to a verified subsetting stage or a strict allowlist used by the runtime variant provider. Subsetting must retain glyph closure and shaping/color/variation tables required by the selected face; R11 qualifies preservation.

Preparation writes a temporary artifact directory, verifies every digest and notice, then atomically publishes the lock and faces.

## Scope

- `packages/core/src/font-pipeline.ts`
- `packages/core/src/types.ts` and config validation
- CSS parser dependency and source resolver
- prepared artifact/lockfile schema v2 with migration diagnostics
- license notice emission
- CLI `inspect` and `prepare` output

## Testing strategy

- Local TTF/OTF/WOFF/WOFF2 and redirected HTTPS sources.
- Multi-weight/style Google CSS fixtures with multiple Unicode ranges.
- Face selection ambiguity and missing coverage failures.
- Lock reproducibility and raw/normalized digest tests.
- Large-face coverage and override tests.
- Notice byte-preservation and invalid SPDX-expression tests.
- Descriptor-based browser rendering for regular, bold, italic, variable, and color faces.

## Risks

- Correct subsetting of complex/color/variable fonts is substantial; if not qualified, v0.1 must require already-subset faces.
- Google Fonts output varies by request profile and can change remotely; raw hashes and locked artifacts are mandatory.

## Exit criteria

The documented multi-weight Google Fonts example and local/direct sources prepare reproducibly into correctly described, coverage-bounded faces with verifiable digests and emitted license notices.

## Implementation record

Merged to `main` in [PR #15](https://github.com/brip-io/glyphscramble/pull/15). Lockfile v2 represents logical families and named faces, uses structured CSS parsing and explicit selectors, records raw/normalized/descriptor identities, enforces runtime coverage, validates SPDX expressions, publishes transactionally, and carries notice bytes into prepared and static artifacts. Dynamic and static `@font-face` rules reproduce the effective face descriptors.

Unit fixtures cover TTF, OTF, WOFF, WOFF2, redirected HTTPS sources, multi-face/subset CSS, ambiguity, invalid licenses and coverage, reproducibility, rollback, v1 migration diagnostics, named runtime faces, and static notice propagation. Real-font OTS, shaping, and cross-browser qualification remain owned by R11 and R12.
