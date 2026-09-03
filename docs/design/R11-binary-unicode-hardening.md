# [R11] Binary and Unicode hardening

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented ([PR #16](https://github.com/brip-io/glyphscramble/pull/16)) · **GitHub issue:** [#12](https://github.com/brip-io/glyphscramble/issues/12)
> **Requires:** R04 · **Blocks:** R01, R12

## Objective

Make remote/CSS/font ingestion resource-bounded and verify that binary rewriting and Unicode 17 permutation preserve the structural inputs required for browser shaping.

## Background

R04 replaced regex CSS extraction with `css-tree`, introduced explicit prepared faces, and made preparation transactional. The remaining ingestion path still buffers bodies before its post-read limit, does not validate media type or network destination, and gives parsing code unbounded compressed inputs. SFNT/WOFF parsing does not validate table checksums, duplicate tags, overlaps, WOFF checksums, or directory invariants. `cmap` parsing merges supported subtables in record order. Unicode structural detection still uses host-regex Unicode behavior, while three UCD downloads are not digest-pinned. Existing binary tests use one synthetic font and representative characters.

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
2. R04's standards-aware CSS parser MUST be retained and covered by malformed-input and resource-ceiling tests; R11 does not introduce a second CSS parser.
3. SFNT/WOFF parsing MUST reject duplicate tags, overlaps, invalid offsets/alignment/lengths, decompression bombs, checksum mismatch, invalid scaler/head state, and unreasonable table/group counts. Default ceilings are 16 MiB normalized bytes, 128 tables, 8 MiB per table, 64 `cmap` records, 100,000 format-12 groups, and 250,000 decoded mappings.
4. cmap subtable selection MUST use documented platform/encoding/format priority rather than record order.
5. Binary operations MUST have deterministic mutation/property tests with a 250 ms per-case ceiling and bounded decoded collections. Coverage-guided fuzzing may extend this corpus later but is not a beta-runtime dependency.
6. Unicode generation inputs MUST have recorded upstream URLs and SHA-256 digests; regeneration MUST verify those digests, support a verified local source directory, and reproduce a recorded generated-file digest.
7. Runtime structural classification MUST use pinned generated Unicode 17 data rather than host regex Unicode behavior.
8. An exhaustive generated-table invariant MUST prove every eligible source/destination pair shares the complete segmentation, bidi, joining, Indic, width, vertical, and emoji signature; official Unicode 17 source and conformance-test locations are recorded in the manifest.
9. R11 MUST provide deterministic OTS/fontTools/HarfBuzz qualification commands and run a redistributable real-font smoke fixture when those pinned tools are available.
10. R12 owns the full Arabic, Hebrew, Devanagari, Thai, Han/Japanese, Hangul, combining, vertical, emoji/ZWJ, color, variable-font, and three-browser matrix. R11 owns the validated binary model and reproducible harness that matrix consumes.

## Design

Split ingestion into streaming transport policy, container decoder, validated SFNT model, and `cmap` transformer. Each layer has explicit resource limits. Remote hostname resolution is checked before every request and redirect, and the built-in transport pins a validated answer to its connection. Literal and resolved loopback, private, link-local, multicast, documentation, benchmarking, and reserved addresses are denied by default; controlled build networks require an explicit configuration override. A custom injected fetch implementation owns its own connection-binding policy.

The source manifest pins the exact Unicode input URLs and SHA-256 digests. The generator can populate a cache online or consume the same verified files from `--ucd-dir` without network access. Generated runtime data includes structural ranges, removing dependency on Node's Unicode property tables, and `--check` verifies byte-for-byte output without rewriting the tree.

R11 uses one pinned redistributable smoke face to prove sanitizer and shaping-tool integration without making its availability part of the runtime package. R12 expands this into the curated licensed matrix. HarfBuzz comparison matches glyph IDs, advances, offsets, clusters, direction, and explicitly selected features; screenshot equality alone is insufficient.

## Scope

- `packages/core/src/font-pipeline.ts`
- `packages/core/src/sfnt.ts`, `cmap.ts`, and binary helpers
- `packages/core/src/unicode.ts` and `scripts/generate-unicode.mjs`
- deterministic mutation/property harnesses and one pinned real licensed smoke fixture
- security model and supported-font documentation

## Testing strategy

- Seeded mutation corpus plus property-based parser tests under explicit collection/time ceilings.
- Redirect/SSRF/content-length/chunked/decompression-limit transport tests.
- Synthetic format 4/12/14 malformed-input and round-trip coverage plus a pinned real variable-font round trip; R12 owns real color-font coverage.
- Exhaustive generated Unicode signature invariants plus pinned source and output checksums.
- OTS/fontTools/HarfBuzz smoke qualification with machine-readable skip/failure status; the complete shape-equivalence matrix remains R12.

## Risks

- Redistributable complex-script/color/variable fixtures require license diligence.
- Exact glyph equality may be font/shaper-version sensitive; pin tool versions and compare the correct invariants.

## Exit criteria

Malformed sources fail within bounded resources, Unicode data regenerates byte-for-byte from verified pinned inputs without host-Unicode classification, `cmap` selection is deterministic, and the real-font smoke face passes checksum plus available OTS/fontTools/HarfBuzz validation. R01 may start after these core gates pass; R12 remains responsible for the complete script/browser matrix.

## Implementation evidence

- Merged to `main` in [PR #16](https://github.com/brip-io/glyphscramble/pull/16), after its R04 dependency landed in PR #15.
- The transport revalidates every redirect, separates IPv4/IPv6 deny lists, binds validated DNS answers to built-in connections, streams through configured byte limits, validates media types and magic, and cancels rejected bodies.
- SFNT/WOFF/WOFF2 and `cmap` parsing enforce the documented structural, checksum, scalar, decompression, and collection limits.
- `scripts/unicode-17-sources.json` pins upstream input and generated-output digests; online generation and offline `--ucd-dir` verification produce identical bytes.
- The deterministic mutation corpus, exhaustive generated-table invariant, and pinned `@fontsource-variable/inter@5.3.0` fixture pass. `pnpm qualify:font` passed HarfBuzz 14.2.1 locally and reported unavailable OTS/fontTools as skipped; R12 must provide and pin all required release tools.
