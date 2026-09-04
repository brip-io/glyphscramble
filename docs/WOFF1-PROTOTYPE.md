# WOFF 1.0 table-reuse prototype

R17 evaluated WOFF 1.0 as an operational alternative to whole-font WOFF2
compression. This is a measured prototype, not a supported output mode.

## Reproduction

```bash
pnpm prototype:woff1
pnpm exec playwright test tests/e2e/woff1-prototype.spec.ts
```

The prototype patches the same `cmap`, reuses compressed bytes for every
unchanged SFNT table, compresses only variant-specific tables, assembles a
standards-valid WOFF 1.0 container, and reparses it through GlyphScramble's
strict font parser. The browser test loads the generated font through
`FontFace` in Chromium, Firefox, and WebKit.

## 2026-09-03 local result

Fixture: pinned `@fontsource-variable/inter@5.3.0` Latin variable face, 122,912
normalized bytes, five response variants, Node 26.3.0. Numbers are indicative
and are not production claims.

| Measurement                       | Result                         |
| --------------------------------- | ------------------------------ |
| Immutable tables reused           | 19 of 21                       |
| Cached WOFF1 generation p50 / p95 | 0.808 / 1.253 ms               |
| Uncached WOFF1 p50 / p95          | 4.732 / 5.058 ms               |
| WOFF2 p50 / p95                   | 411.506 / 545.643 ms           |
| Average WOFF1 transfer            | 60,826 bytes                   |
| Average WOFF2 transfer            | 49,294 bytes                   |
| WOFF1 transfer increase           | 23.4%                          |
| Browser load                      | Chromium, Firefox, WebKit pass |

WOFF1 table reuse removes the WASM worker from generation and makes the
variant-specific work small and synchronous for this fixture. It also sends
roughly one quarter more bytes for every one-use font, introduces a second
container path and MIME/URL contract, and does not remove the process-local
mapping lifecycle.

## Decision

Reject WOFF1 for the v0.1 runtime. Keep WOFF2 as the single supported response
format and use persistent, recyclable workers plus bounded acquisition to make
its cost operationally explicit. The transfer penalty is paid on every
protected response, while the WOFF2 generation cost is paid ahead of demand and
bounded by the pool.

Retain the reproducible prototype as a contingency. R12 may revisit the
decision only with controlled-hardware throughput, network transfer, browser,
and operational evidence across the full qualified font matrix.
