# [R16] Permutation and request-path efficiency

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P0 · **Status:** Implemented ([PR #44](https://github.com/brip-io/glyphscramble/pull/44), corrected by [PR #45](https://github.com/brip-io/glyphscramble/pull/45)) · **GitHub issue:** [#33](https://github.com/brip-io/glyphscramble/issues/33)
> **Blocked by:** R01 and R11 · **Blocks:** R12 performance qualification

## Objective

Remove repertoire-sized cryptographic work from `scramble()` while preserving the exact Unicode-safe mapping used to generate the response font.

## Background

The 2026-09-03 repository review confirmed that `defaultGenerator` computes a permutation to patch `cmap`, stores only compressed font bytes, and `ResponseContext.scramble()` reconstructs the same permutation with one HMAC per Fisher–Yates swap. Indicative measurements were 2 ms for Inter Latin, 37 ms for a 2.8k-codepoint face, and 340 ms for a 20k-codepoint CJK-sized face. The generator also rebuilds property groups even though engine startup already created a `PermutationPlan`. `randomIndex` uses modulo reduction; its negligible bias is not a content-security issue but disappears naturally with the redesign.

## Goals

- Make request-time scrambling proportional to text length, not font repertoire.
- Compute one deterministic mapping per variant/face and use it for both font generation and text encoding.
- Preserve Unicode property, normalization, shaping, fixed-point, and domain-separation invariants.
- Keep cryptographic randomness out of public APIs and logs.

## Non-goals

- Claiming that a less biased permutation makes content secret.
- Changing static-build mapping identity or token encryption.
- Replacing browser shaping or introducing glyph slicing.

## Requirements

1. `VariantFace` MUST carry the precomputed `PermutationPlan`; generation MUST NOT reclassify the face's codepoints.
2. A stored variant MUST retain the exact per-face encode/decode mapping used to patch its `cmap`.
3. A lease MUST expose that mapping to the engine through an internal typed boundary; `scramble()` MUST NOT recompute it.
4. Mapping lookup MUST remain scoped to variant and prepared-face identity and MUST be cleared with variant expiry/closure.
5. The shuffle MUST replace per-swap HMAC with a reviewed deterministic keystream and unbiased rejection sampling.
6. Tests MUST prove font decoding and text encoding use one identical mapping across all qualified scripts and faces.
7. Encoding 10,000 qualified scalars MUST remain under the R12 5 ms p95 request-path gate; separate generation metrics MUST not be attributed to encoding.
8. No new mapping, seed, plaintext, or content-derived diagnostic may enter tokens, logs, or metrics.

## Design

Derive per-group AES-256-CTR key/counter material using the existing seed plus length-delimited algorithm, namespace, Unicode-version, and property-group identities. Generate 32-bit words in blocks and use rejection sampling before Fisher–Yates selection. The provider applies the engine's precomputed plan once, passes that exact permutation to `defaultGenerator` for `cmap` patching, and retains an immutable typed-array hash lookup beside the compressed bytes. The server-only provider contract resolves that lookup from a live lease; mappings never enter payloads or tokens.

The engine encodes text directly through the leased mapping. Tests compare every retained encode entry with the permutation supplied to the generator and with the resulting `cmap` glyph target.

## Scope and deliverables

- Unicode permutation keystream and unbiased bounded integer generator.
- Plan-aware variant generation and mapping-retaining store/lease types.
- Engine request path using retained mappings.
- Latin, complex-script, large-repertoire, determinism, memory, and benchmark fixtures.
- ADR update documenting algorithm/version identity and migration behavior.

## Testing strategy

- Known-seed vectors pin deterministic output and rejection behavior.
- Property/signature, normalization, segmentation, bidi, shaping, fixed-point, and cmap round-trip suites run against retained mappings.
- A mutation test that restores request-time permutation construction MUST fail the 20k-codepoint request-path gate.
- Memory tests account for retained maps in cache limits and prove expiry releases them.
- Node 22/24 benchmarks report mapping generation separately from text encoding.

## Risks

- Retaining maps increases active-variant memory; compact typed arrays and explicit accounting are required.
- Changing the deterministic shuffle changes artifact identity; version the mapping algorithm and never mix versions within a token/font pair.
- Keystream misuse can introduce correlation. Domain separation and fixed test vectors receive security review.

## Dependencies

- R11 owns Unicode/binary invariants.
- R17 consumes the resulting generation and request-cost metrics for capacity planning.
- R12 owns final Node/script/browser performance qualification.

## Exit criteria

Font generation and text encoding consume the same stored mapping, no repertoire-sized cryptographic loop runs during `scramble()`, all Unicode/cmap invariants pass, retained-map memory is bounded and released, and the large-repertoire request path meets the qualified 5 ms p95 gate on Node 22/24.

## Implementation evidence

- [PR #44](https://github.com/brip-io/glyphscramble/pull/44) versions the
  permutation as `glyphscramble-aes-256-ctr-rejection-v2`, derives
  length-delimited domains with HMAC-SHA256, and consumes AES-256-CTR words
  through unbiased rejection sampling.
- Prepared faces carry the startup-built `PermutationPlan`. The provider passes
  one resulting `Permutation` to font generation and retains the exact compact
  `CodePointMapping`; the engine resolves that mapping through a server-only
  lease boundary and never reconstructs a repertoire permutation.
- Variant cache accounting includes retained font and mapping bytes, and expiry
  or closure releases both. Generation begins outside the acquiring call stack,
  so refill cost is not misreported as request encoding.
- The request encoder memoizes scalar classification and lookup per call. The
  20,142-codepoint benchmark repertoire keeps 10,000-scalar encoding below the
  5 ms p95 gate on Node 22 and 24 while reporting generation separately.
- Tests pin the deterministic keystream and rejection path, compare retained
  Latin and Hebrew mappings with both generator input and patched `cmap`, cover
  the low-level provider seam, and prove memory release and repeated-scalar
  lookup behavior.
- [PR #45](https://github.com/brip-io/glyphscramble/pull/45) corrects the
  remaining BMP binary inefficiency by representing contiguous format 4 runs as
  delta or glyph-array segments. Direct round trips cover arbitrary mappings,
  constant deltas, and the exact 65,535-byte table boundary.

## Review record

R16 closes review findings S6, P1, and P11 from the 2026-09-03 repository
review. PR #44 removed modulo reduction and request-time repertoire work; the
post-merge documentation audit found that P11's format 4 assignment remained
open, so PR #45 corrected it before this design was marked implemented. R16
also removed request-path work and measurement contamination that contributed
to P12. R17 now supplies stable shared-runner capacity methodology, while R12
retains final controlled-hardware and release qualification.
