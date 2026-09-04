# [R19] Static compiler scale and diagnostics

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #59](https://github.com/brip-io/glyphscramble/pull/59) · **GitHub issue:** [#36](https://github.com/brip-io/glyphscramble/issues/36)
> **Blocked by:** R02 and R03 · **Blocks:** R12 static qualification

## Objective

Keep static/per-build protection predictable on wide or large sites and move text-coverage failures into the plan phase with file/DOM repair context.

## Background

The 2026-09-03 review confirmed that static scanning computes root-relative element paths repeatedly for every node, including nodes outside protected subtrees. `elementPath` walks ancestors and scans siblings, producing quadratic behavior on wide DOMs. Each transformed HTML document is parsed during plan, transform, and verify; assets are copied serially. Text normalization/coverage failures occur during transformation after generation/staging has begun and omit the file and DOM path that planner errors already provide.

## Goals

- Make scan cost approximately linear in document size.
- Fail all known text-mappability errors during planning with actionable context.
- Reuse parse/planning work where it safely preserves transactional verification.
- Add bounded I/O concurrency before documenting large-site support.

## Non-goals

- Weakening the final independent output verifier.
- Supporting hydrated static applications outside R02's boundary.
- Claiming unlimited input/site size.

## Requirements

1. DOM paths MUST be computed lazily only for findings or protected nodes and MUST avoid repeated sibling scans.
2. Hydration/content detectors MUST skip unrelated subtrees except where ancestor safety requires inspection.
3. Planning MUST validate NFC and every protected scalar against the selected face and throw `StaticBuildPlanError` with file, DOM path, font/face, and coverage repair guidance.
4. Transformation SHOULD consume the validated plan/AST without reparsing; final verification MUST remain independent.
5. Asset reads/writes and HTML work MAY run with a documented bounded concurrency and deterministic manifest order.
6. Benchmarks MUST cover deep trees, 10k-sibling tables, many files/assets, mixed protected blocks, and early failure.
7. Static size/performance claims MUST state tested ceilings and deployment assumptions.

## Design

Track path indexes during one traversal and materialize strings only when needed. Mark protected/ancestor-relevant regions before invoking expensive detectors. Extend planned-file records with validated text spans, face identity, and reusable parse representation; transformation verifies source identity before using them. Keep the published-output verifier as a fresh parse. Use a small task pool for independent files and preserve sorted output/manifest assembly.

## Scope and deliverables

- Linear traversal/path bookkeeping and detector pruning.
- Plan-phase text normalization/coverage validation with contextual errors.
- Safe plan/AST reuse and bounded file/asset concurrency.
- Large/wide/deep site benchmarks and documented support limits.
- Static generic-error localization contract coordinated with R18.

## Testing strategy

- Instrumented 10k-sibling/deep-tree fixtures assert bounded path/detector calls and wall-time budgets.
- A mutation restoring eager `elementPath` calls MUST fail the wide-DOM regression gate.
- Non-NFC/missing-codepoint fixtures fail before staging with exact file/path/face details.
- Concurrent and serial builds remain byte-identical for a fixed seed; injected I/O failures retain transactional rollback.
- Final verifier mutation tests prove AST reuse cannot bypass output validation.

## Risks

- Reusing mutable ASTs can couple planning and transformation; freeze/clone the planned representation and verify source digests.
- Parallel I/O can increase memory and nondeterminism; cap work and sort all published metadata.

## Dependencies

- R02/R03 define safe transformation, delivery, caching, CSP, and rollback.
- R18 owns shared localized failure options.
- R12 owns final static leakage, browser, and performance qualification.

## Exit criteria

Wide/deep static fixtures scale within documented budgets, known text failures stop in planning with actionable file/DOM context, output remains deterministic and transactional under bounded concurrency, and the independent verifier still catches every mixed/plaintext mutation.

## Implementation evidence

- Planning builds one weakly referenced path index with per-parent tag counters,
  lazily renders paths, and runs configurable hydration detectors only within
  protected or ancestor-relevant regions. Document-level script hazards retain
  their independent global scan.
- The planner loads each selected prepared face and validates NFC plus the
  actual Unicode permutation pool before any staging directory exists. Its
  safe error includes file, DOM path, font, face, code point, normalization
  state, and coverage repair guidance without source text.
- Transformation clones the validated planned AST after rechecking the source
  digest. Publication and asset generation use a deterministic bounded task
  pool (default 8, configurable 1–32) that fully settles in-flight operations
  before transactional rollback.
- The manifest carries a one-way fingerprint of the encoded protected text and
  the localized generic failure contract. The final verifier freshly parses
  emitted HTML and rejects protected-text or marker mutations independently of
  planner state.
- Node 22/24 tests cover 10,000 same-tag siblings, 1,000 nested elements,
  40 mixed HTML files, 100 assets, serial/eight-way byte equivalence, source
  mutation, injected I/O failure, localized failure output, and plaintext
  restoration. The wide/deep gates are each capped at three seconds; those
  fixture sizes are documented as beta ceilings rather than unlimited scale.

[PR #59](https://github.com/brip-io/glyphscramble/pull/59) carries the
implementation, public migration metadata, and qualification evidence.
