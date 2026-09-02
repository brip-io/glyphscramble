# [R11] Binary and Unicode hardening

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Proposed · **GitHub issue:** pending
> **Blocks:** R01, R04, R12

## Objective

Make remote/CSS/font ingestion resource-bounded and verify that binary rewriting and Unicode 17 permutation preserve the structural inputs required for browser shaping.

## Background

Remote bodies are buffered before the post-read size check in `packages/core/src/font-pipeline.ts:52-57`; content type and private-network destinations are not validated. CSS parsing is regex-based. SFNT/WOFF parsing does not validate table checksums, duplicate tags, overlaps, WOFF checksums, or all directory invariants. Unicode structural detection partly relies on the host Node Unicode version, while generated UCD downloads lack pinned digests. Existing tests use one synthetic font and representative characters rather than official fixtures.

## Goals

- Bound memory/CPU for every supported untrusted input.
- Pin Unicode 17 generation reproducibly.
- Validate cmap 4/12/14 and preserved table/checksum contracts with real tools.
- Prove segmentation, bidi, joining, and shaping signatures across qualified scripts.

## Non-goals

- Supporting TTC in v0.1.
- Repairing malformed fonts.
- Claiming arbitrary fonts/scripts are safe without fixtures.

## Requirements

1. Remote resolution MUST stream with byte limits, total/per-hop timeouts, redirect limits, HTTPS enforcement, content-type/magic validation, and private/link-local/loopback destination policy.
2. CSS parsing MUST be standards-aware and restricted to supported `@font-face` sources.
3. SFNT/WOFF parsing MUST reject duplicate tags, overlaps, invalid offsets/alignment/lengths, decompression bombs, checksum mismatch, invalid scaler/head state, and unreasonable table/group counts.
4. cmap subtable selection MUST use documented platform/encoding/format priority rather than record order.
5. Binary operations MUST have fuzz/property tests with time and allocation ceilings.
6. Unicode generation inputs MUST have recorded upstream URLs and SHA-256 digests; regeneration MUST be deterministic and offline-capable from pinned inputs.
7. Runtime structural classification MUST use pinned generated Unicode 17 data rather than host regex Unicode behavior.
8. Official grapheme, word, line-break, and bidi fixtures MUST assert preserved relevant properties before/after encoding.
9. HarfBuzz tests MUST cover Arabic, Hebrew, Devanagari, Thai, Han/Japanese, Hangul, combining sequences, vertical text, emoji/ZWJ, color, and variable fonts.
10. OTS and browser/font-tool acceptance MUST run on original and generated real-font fixtures.

## Design

Split ingestion into streaming transport policy, container decoder, validated SFNT model, and cmap transformer. Each layer has explicit resource limits. Remote hostname resolution is checked before connection and after redirects; policy remains configurable for controlled enterprise build networks.

Vendor or cache the exact Unicode input files with a source manifest and generation digest. Generated runtime data includes structural status, removing dependency on Node's Unicode property tables.

Use a curated redistributable font fixture matrix with license notices. HarfBuzz shapes original plaintext/original font and encoded text/generated font; glyph IDs, advances, offsets, clusters, and direction-specific outputs are compared under documented tolerances.

## Scope

- `packages/core/src/font-pipeline.ts`
- `packages/core/src/sfnt.ts`, `cmap.ts`, and binary helpers
- `packages/core/src/unicode.ts` and `scripts/generate-unicode.mjs`
- fuzz/property harnesses and real licensed font fixtures
- security model and supported-font documentation

## Testing strategy

- Seeded fuzz corpus plus property-based parser tests.
- Redirect/SSRF/content-length/chunked/decompression-limit transport tests.
- Real format 4/12/14, variable, and color font round trips through OTS/fontTools.
- Official Unicode test files and pinned regeneration checksum.
- HarfBuzz shape-equivalence matrix with failures stored as reviewable artifacts.

## Risks

- Redistributable complex-script/color/variable fixtures require license diligence.
- Exact glyph equality may be font/shaper-version sensitive; pin tool versions and compare the correct invariants.

## Exit criteria

Malformed sources fail within bounded resources, Unicode data regenerates byte-for-byte from pinned inputs, and the qualified real-font/script matrix passes checksum, OTS, official Unicode, and HarfBuzz invariants.
