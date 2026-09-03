# [R20] Core contract and operator hardening

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #49](https://github.com/brip-io/glyphscramble/pull/49) · **GitHub issue:** [#37](https://github.com/brip-io/glyphscramble/issues/37)
> **Blocked by:** R04-R06 and R11 · **Blocks:** R12 release qualification

## Objective

Close the remaining server/client bounds, error-quality, token-operation, remote-fetch, versioning, and content-coverage gaps before operators depend on the beta.

## Background

The 2026-09-03 review confirmed several small gaps with large operational effects: the browser rejects more than 1,024 coverage ranges while preparation can emit them; configurable timers accept values above Node's timer ceiling; strict font rejection lacks repair guidance; token URLs are absent from logging guidance; missing redirect locations are misreported; unsupported content can take down an entire SSR page without an omit-block fail-closed option; reading `context.token` leases hidden capacity; the engine tamper test mutates the filename rather than token bytes; and lockfiles hardcode `0.1.0-beta.0`.

## Goals

- Enforce all wire/runtime limits at the earliest server/build boundary.
- Preserve fail-closed behavior without forcing a whole-page 500 for an optional block.
- Make operator errors actionable and security documentation operationally complete.
- Keep package/lockfile version identity correct automatically.

## Non-goals

- Relaxing hostile-font validation by default.
- Returning plaintext for unsupported content.
- Treating encrypted font tokens as content secrets.

## Requirements

1. Preparation MUST reject coverage exceeding the client's range/count/size limits and name the family/face plus a coverage/subsetting repair.
2. Remote/generation/browser timers MUST reject values above the effective Node/browser ceiling with option-specific errors.
3. Font validation errors MUST identify rejection class and documented `fonttools`/`ots-sanitize` repair paths without auto-mutating user fonts.
4. Security/operations docs MUST state that encrypted tokens appear in paths/history/access logs and recommend path redaction plus private caching.
5. IPv4-compatible IPv6 destinations MUST follow the same private/reserved blocking policy; 3xx without `Location` MUST receive an accurate bounded error.
6. An optional-block policy MAY omit the protected block or emit the generic fail-closed status on unsupported text; it MUST never emit plaintext and MUST be explicit per block/config.
7. Unsupported-text errors MUST name codepoint, normalization state, family/face, and safe coverage remediation without echoing the full content.
8. `ResponseContext.token` MUST not silently lease capacity while `used` remains false; remove it publicly, make use visible, or provide a diagnostics-only boundary.
9. Token tamper tests MUST mutate the token while preserving the valid filename/path and prove decryption rejection.
10. Lockfile/tool version MUST come from one build-time package-version source and remain testable in packed artifacts.

## Design

Centralize payload bounds shared by preparation and browser validation. Add explicit maximum timer constants. Map parser failures to stable diagnostic codes and documentation anchors. Introduce a fail-closed block result/error boundary that adapters can render without serializing input. Narrow or remove the public token getter. Inject package version at build time or generate a small version module from `package.json` so browser/server code does not perform runtime filesystem discovery.

## Scope and deliverables

- Shared coverage/timer bounds and preparation checks.
- Actionable font and unsupported-content diagnostics.
- Optional fail-closed omit/error block policy.
- Token path/logging guidance and token getter correction.
- Remote redirect/IP edge fixes.
- Real tamper-path test and generated version source.
- `doctor` content-fixture coverage scan coordinated with R15.

## Testing strategy

- Boundary tests cover exactly/over 1,024 ranges, payload bytes, and maximum timers.
- Real malformed-but-repairable fonts assert stable error code and repair link.
- Optional-block tests prove no plaintext in HTML/RSC/log/error messages and no whole-page failure.
- DNS/redirect fixtures cover `::/96`, 304, and missing `Location` accurately.
- Token getter/capacity tests prove unused responses retain no lease.
- Packed-version tests compare package, CLI, and lockfile versions after a synthetic Changeset bump.

## Risks

- Omit-block policy can conceal publisher mistakes; default remains throw and diagnostics remain prominent.
- Repair guidance can be mistaken for automatic sanitization; docs retain the strict trust boundary.
- Build-time version injection must work for local development and packed consumers identically.

## Dependencies

- R04/R11 own font and parser foundations; R05/R06 own token/payload boundaries.
- R15 owns guided doctor/config ergonomics.
- R12 qualifies packed version identity and all security/error contracts.

## Implementation notes

[PR #49](https://github.com/brip-io/glyphscramble/pull/49) completed the
operator boundary as follows:

- one shared limits module now governs server emission, browser consumption,
  prepared coverage, runtime/remote timer inputs, and lease expiry; the server
  runs the complete browser payload validator before marking a response used;
- `GlyphContentError` reports code point, normalization state, family/face, and
  a repair anchor without source text, while explicit `protect()` and
  `protectAsync()` boundaries return either a payload or content-free omitted
  diagnostics in core, React server helpers, and Next;
- `GlyphFontError` classifies strict parser failures and points operators to
  documented OTS/fonttools workflows without modifying input; mapped and
  compatible IPv6 addresses now reuse the IPv4 deny policy, and redirects
  without `Location` have a distinct bounded error;
- the public token getter was removed, tamper coverage now changes encrypted
  token bytes while preserving the valid font path, and the security guide
  documents path/access-log redaction plus private cache policy;
- a generated package-version module drives the CLI, user agents, and lockfile.
  The repository check packs the package and compares its manifest, generated
  module, and CLI output. The packed browser runtime is additionally asserted
  to remain one self-contained ESM artifact after a real consumer test exposed
  an internal-import regression during CI.

The optional policy is deliberately per block rather than configuration-wide,
so a global setting cannot hide coverage mistakes. The broader `doctor`
content-fixture scan remains with R15's guided readiness work; R20 supplies the
typed diagnostics that scan will consume.

CI passed DCO, Node 22.13/24 validation and runtime benchmarks, the packed
Astro/Vite/Node and Next consumers, and Chromium/Firefox/WebKit runtime tests.

## Exit criteria

Every server-emitted payload fits client bounds, timers cannot overflow, font/content/remote failures have precise repair guidance, optional blocks can fail closed without plaintext or page-wide failure, unused contexts consume no hidden lease, token tampering reaches cryptographic validation, token logging risk is documented, and packed lockfiles report the actual package version.
