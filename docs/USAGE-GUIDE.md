# Choosing what to protect

GlyphScramble is most useful when a publisher can isolate a high-value block from the page’s public discovery and interaction surfaces.

## Protect selectively

Good candidates are optional premium excerpts, proprietary tables, post-login research snippets, and other blocks where a human reader can tolerate a font-loading boundary. Keep an ordinary HTML summary near the block so the page remains understandable when the font is unavailable.

Do not protect:

- page titles, primary headings, navigation, breadcrumbs, link labels, or search snippets;
- forms, buttons, validation messages, prices required for a transaction, or account recovery;
- legal notices, emergency or safety information, educational accommodations, or regulated disclosures;
- OpenGraph, JSON-LD, RSS, Atom, sitemaps, email, print output, clipboard workflows, or API fields unless each channel is separately designed and tested;
- content whose confidentiality matters. A browser can recover the mapping.

## Choose and prepare font faces

Local files and direct HTTPS font URLs prepare one face. TTF, OTF, WOFF, and WOFF2 containers are accepted; TTC collections are rejected. A Google Fonts CSS source may describe several weights, styles, stretches, and Unicode subsets, so configure every intended face explicitly:

```ts
body: {
  source: {
    kind: "google-css",
    url: "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;1,700",
  },
  license: { spdx: "OFL-1.1", file: "./licenses/OFL.txt" },
  faces: {
    regular: { family: "Inter", weight: 400, style: "normal", coverage: ["U+0000-00FF"] },
    bold: { family: "Inter", weight: 700, style: "normal", coverage: ["U+0000-00FF"] },
    boldItalic: { family: "Inter", weight: 700, style: "italic", coverage: ["U+0000-00FF"] },
  },
  defaultFace: "regular",
}
```

If a selector matches zero or several CSS faces, preparation fails and lists the available candidates. CSS is fetched with a pinned WOFF2-capable request profile, and the resulting lock records that profile, original and final URLs, raw and normalized SHA-256 hashes, inferred names, axes, layout features, source descriptors, effective descriptors, and Unicode coverage. Runtime calls select a named face with `{ font: "body", face: "bold" }`.

`coverage` is a strict runtime allowlist: only source codepoints inside the configured ranges enter the permutation. It does not physically remove unselected outlines or shaping tables, so use a pre-subset font when download size matters. A large face must have effective coverage or `allowLargeFont: true`.

`prepare` validates the SPDX expression and copies the license or notice bytes to `.glyphscramble/licenses`. Static builds copy those notices beside generated assets. This preserves notices; it does not establish that the font license permits modification or redistribution. Review the font license yourself.

## Unsupported content

The default is intentionally strict: `scramble()` and `scrambleAsync()` throw a
`GlyphContentError` before leasing a font variant when text is not NFC or the
selected face has no Unicode-safe mapping. The error names only the code point,
normalization state, configured family, and face; it never echoes the source
text. Normalize publisher content with `text.normalize("NFC")`, then add the
required code point to the configured coverage and prepare a licensed source
face that actually contains it.

For a genuinely optional high-value block, opt in at that call site with
`protect()` or `protectAsync()`. The result is discriminated and an omitted
result contains only safe diagnostics—never the input:

```ts
const result = await context.protectAsync(excerpt, {
  font: "body",
  unsupported: "omit",
});

if (result.status === "omitted") {
  return renderGenericStatus("Protected block unavailable.");
}
return renderGlyphPayload(result.payload);
```

React server code can use `protectGlyphBlock()` or
`protectGlyphBlockAsync()` from `@brip/glyphscramble-react/server`. Do not put
the source text in the fallback, logs, RSC props, hydration state, or error
telemetry. Omission is explicit per block because using it globally can conceal
coverage mistakes; required content should keep the default throwing behavior.

## SEO

Search crawlers receive encoded Unicode values. Even when the browser paints the right outlines, those values do not become meaningful indexable words. Keep canonical titles, descriptions, headings, internal-link context, structured data, and enough unprotected summary copy for discovery. Protected blocks should usually be `noindex` or live behind authentication.

Do not put plaintext into JSON-LD, `aria-label`, hidden DOM nodes, comments, hydration props, source maps, OpenGraph descriptions, or client bundles to compensate. That defeats the extraction boundary.

## Static compiler boundary

Static mode accepts an unprotected source directory and a separate sibling
destination. It scans and validates the source before creating a fresh staging
tree, then transactionally replaces the destination only after transformation,
font generation, notice copying, and manifest creation succeed. A failed build
leaves both the source and the previous publication untouched. Use
`--existing-output reject` when deployment policy requires an absent output
instead of replacement.

The supported boundary is non-hydrated HTML. Within a marked block, the compiler
rejects scripts, styles, noscript and template content, comments, forms, links,
interactive controls, text-bearing attributes, and known framework hydration
markers. It also rejects a protected block nested inside a known hydrated or
interactive ancestor. This is a conservative refusal mechanism, not proof that
an unknown generator is safe; register a `StaticHydrationDetector` for custom
client-runtime markers.

Nested markers using the ancestor's font are encoded once as part of the outer
block and produce a manifest warning. A different nested font is ambiguous and
fails. Unmarked HTML and non-HTML files retain their exact bytes. Always compile
from the original generator output, never from a previously protected tree.

The content-addressed static manifest v3 records source HTML SHA-256 values,
transformed files, protected-output fingerprints, the complete asset graph,
selected font identities, the algorithm version, a one-way seed identity, the
generic failure text, and warnings. It contains neither the mapping seed nor
protected plaintext. Run
`glyphscramble doctor --static-output <directory>` before publishing; it rejects
tampered assets or protected text, stale HTML references, and trees containing
more than one build manifest.

Planning validates normalization and every protected scalar before staging. A
known text failure reports the source file, DOM path, font, face, code point,
and repair guidance without echoing the source text. HTML transformation uses
a clone of the validated parse, but final verification always reparses the
published bytes independently.

Static file work is deterministic and bounded to eight concurrent tasks by
default; use `--concurrency <1-32>` to fit a constrained build runner. The beta
regression gate covers 10,000 same-tag siblings, 1,000 nested elements, and a
40-page/100-asset publication. These are tested ceilings, not an unlimited-size
claim; see [Static deployment](STATIC-DEPLOYMENT.md#scale-and-concurrency).

## Caching

Per-response payloads make the containing HTML/RSC/JSON dynamic and `private, no-store`. `ResponseContext.used` remains false until `scramble()` succeeds, so post-render middleware preserves an unprotected response's original cache policy. The matching font is private and immutable only for its remaining token lifetime; `max-age` shrinks on every request. Its bytes and compact encode mapping stay in the issuing engine's bounded cache and are never evicted while that token remains valid; when active variants consume the byte ceiling, new protected responses fail closed until capacity expires. Size `cacheMaxBytes` from the generated WOFF2 size plus mapping storage, peak protected-response rate, and `tokenTtlSeconds`. A mostly static page should isolate the protected block behind a small dynamic server boundary rather than disabling caching for the whole site.

## Runtime secrets and rotation

Generate production secrets with `openssl rand -base64 48`; do not commit them.
`rotation.keyId` identifies the active key and `secretEnv` names its environment
variable. During rotation, change both and put the old ID/environment name in
`previousKeys` for at least `tokenTtlSeconds`. At most three previous keys are
accepted. GlyphScramble derives a separate AES key for each ID and refuses
startup if any configured secret is missing or shorter than 32 characters.
Token lifetimes cannot exceed 24 hours.

Static mode is the opposite trade: output can be cached globally, but the mapping is reused until the next build. Rotate by rebuilding and deploy each output tree as one unit. Font, CSS, JavaScript, and manifest names contain SHA-256 digests of their bytes and sit below a build-ID directory, so they may use long-lived immutable caching. HTML must revalidate, and a static manifest should use `no-cache`; never combine HTML and assets from different output trees.

For exact subpath, cache, CSP, and atomic-publication settings, see
[Static deployment](STATIC-DEPLOYMENT.md).

## Accessibility

There is no honest plaintext accessibility mirror: any mirror is also a plaintext scraping surface. GlyphScramble therefore marks protected output `aria-hidden` and requires `accessibilityRiskAcknowledged: true`.

This means the protected block is not WCAG-conformant. Limit it to opted-in, non-essential content, give users an accessible acquisition path outside the protected representation, and involve accessibility and legal reviewers. Never infer acknowledgement merely because a framework integration was installed.

## Failure behavior

Protected elements stay hidden until the shared runtime confirms that the exact generated face loaded and was applied. Duplicate blocks share a reference-counted registration; updates and unmounts abort stale work and release timers, rules, and faces. A timeout, CSP/font error, process restart, wrong-instance route, or exhausted variant pool produces a visible generic error, never plaintext. Monitor the engine's content-free counters and timings in your own application without sending content or mapping data to BRIP.

The v2 wire payload is data-only and capped at 1 MiB on both emission and
consumption. Coverage is capped at 1,024 canonical ranges of at most 32 UTF-8
bytes each, so preparation rejects a face that the browser would refuse. It
contains no CSS and is validated after serialization before the browser uses
it. Generated font URLs are root-relative and same-origin. See [Client payload
and font lifecycle](CLIENT-RUNTIME.md) for the vanilla API and strict-CSP
configuration. Prefer a per-response nonce (`style-src` with that nonce and
`style-src-attr 'none'`); the no-nonce fallback needs `style-src-attr
'unsafe-inline'`.
