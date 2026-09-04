# [R18] Multi-face payload and client efficiency

> **Parent:** [R00](R00-release-readiness.md) · **Size:** M · **Priority:** P1 · **Status:** Implemented in [PR #53](https://github.com/brip-io/glyphscramble/pull/53) · **GitHub issue:** [#35](https://github.com/brip-io/glyphscramble/issues/35)
> **Blocked by:** R06 and R16 · **Blocks:** R12 payload/browser qualification

## Objective

Give one protected response a stable authorization and compact face manifest so multiple weights/styles do not reissue tokens, duplicate descriptors, download the same font twice, or remount unchanged client payloads.

## Background

The 2026-09-03 review confirmed that `ensureIssued()` replaces the token whenever the authorized face set grows. Earlier payloads retain older URLs and generated family names, so a regular/bold/regular render sequence can register and fetch the same variant face more than once. Each payload also repeats identical `face.unicodeRange` and `coverage.ranges`, which dominates small protected spans on fragmented fonts. React remounts when a parent recreates an equivalent payload object because its effect depends on object identity.

## Goals

- Keep one response token/variant identity stable across all declared faces.
- Download and register each face at most once per document payload identity.
- Reduce repeated wire metadata while keeping validation strict and local.
- Make equivalent reactive payload objects no-ops rather than visible remounts.

## Non-goals

- Sharing a mapping across responses.
- Making plaintext acceptable in Client Components.
- Hiding face authorization or accepting arbitrary font URLs.

## Requirements

1. A response MUST predeclare authorized faces or authorize a bounded prepared family set before its first payload; adding a later block MUST NOT invalidate earlier URLs.
2. Generated family/face identity MUST be stable for one variant and face.
3. The wire contract MUST carry face descriptors once per response manifest or eliminate exact duplicate fields while retaining exact-key validation and coverage identity.
4. The client registry MUST coalesce equivalent face loads across blocks and payload object clones.
5. React/Vue/Svelte/Astro components MUST expose the same timeout/error localization options and react only to semantic payload changes.
6. Any wire-version change MUST reject mixed versions clearly and include a Changeset/migration guide.
7. Multi-face authorization MUST remain bounded by prepared configuration and token limits.

## Design

Evaluate two compatible mechanisms: `beginResponse({ fonts/faces })` predeclaration, and family-wide authorization on first use. Prefer the smallest authorization that remains stable before bytes escape. Introduce a response face manifest keyed by immutable face identity; payload blocks reference that key plus encoded text. Client adapters derive a scalar semantic identity from URL, encoded text, descriptors, expiry, language, and nonce rather than JavaScript object identity.

## Implementation notes

`beginResponse()` fixes its authorization scope at construction. The convenient
default is every prepared face in the bounded engine configuration; routes can
narrow that scope with `beginResponse({ faces: [{ font, face }] })`. The token
is issued once on first successful protection and never replaced. An omitted
or undeclared face fails before acquiring a variant, while `ResponseUsage`
separates the stable authorized set from faces actually used.

Payload v3 takes the requirement's self-contained alternative to a separately
serialized response manifest. Every block remains independently streamable,
but exact duplicates are removed: the token exists only inside `fontUrl`, the
coverage ranges exist only in `face.unicodeRange`, `coverage` is the immutable
identity string, and response-pool rotation is implied by the v3 contract.
This preserves the one-prop adapter DX and avoids requiring a manifest provider
to precede lazy RSC/Astro blocks.

The shared runtime exports one validated semantic-identity helper. React uses
it as its effect key, while the mount lifecycle makes cloned updates no-ops for
Vue, Svelte, vanilla, and custom integrations. A reference-counted 64-entry
document registry retains settled zero-reference faces only until token expiry,
evicts least-recently-used idle entries under pressure, and removes failed or
abandoned loads eagerly. This covers temporary framework remounts without an
unbounded font/style cache.

[PR #53](https://github.com/brip-io/glyphscramble/pull/53) merged these
contracts with a minor Changeset and a payload-v3 migration guide. CI passed
DCO, Node 22.13/24 validation and runtime benchmarks, the packed
Astro/Vite/Node and Next consumers, and Chromium/Firefox/WebKit browser tests.
The regular/bold/regular browser fixture observes one request per unique face;
the engine fixture also proves one stable token across multiple faces and
families, narrowed-scope rejection before leasing, and a repeated-block wire
size below 75% of the equivalent v2 payload.

## Scope and deliverables

- Stable multi-face response authorization and token tests.
- Versioned compact payload/face-manifest contract.
- Shared semantic identity and registry coalescing across UI adapters.
- Consistent timeout and localized generic-error options.
- Wire-size, duplicate-request, reactive-update, and navigation fixtures.

## Testing strategy

- Regular/bold/regular and multi-family pages assert one token and one network request per unique face.
- Equivalent cloned payloads trigger no hide/load/reveal cycle; changed text or URL does.
- Payload-size snapshots cover many small blocks and fragmented coverage.
- Tampered manifest references, excess faces, old/new wire mixing, expiry, and cleanup fail closed.
- Browser matrices inspect `document.fonts`, request counts, accessibility tree, and reveal timing.

## Risks

- Predeclaring every configured face can widen token scope and increase generated bytes; authorization stays explicit and bounded.
- A shared manifest complicates streaming order; the server boundary must emit manifest data before referencing blocks.

## Dependencies

- R06 owns the current client contract; R16 supplies retained per-face mappings.
- R07-R10 adopt the shared semantic lifecycle.
- R12 qualifies browser/network and wire-compatibility behavior.

## Exit criteria

A multi-face page keeps stable response authorization, performs one fetch/registration per unique face, emits materially smaller repeated-block payloads, ignores equivalent object clones, handles semantic changes reactively, and passes strict tamper, expiry, cleanup, and cross-framework browser tests.
