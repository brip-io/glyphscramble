# Static deployment

Static mode is a per-build fallback for non-hydrated HTML. It preserves CDN
caching, but every visitor receives the same downloadable mapping until the
next build. Use per-response SSR for the highest-value material; use static
mode only for optional, opted-in blocks where that weaker boundary is
acceptable.

## Configure and build

```ts
export default defineGlyphConfig({
  // fonts, rotation, and the required accessibility acknowledgement omitted
  static: {
    publicBasePath: "/docs",
    fontLoadTimeoutMs: 8_000,
    fontFailure: "generic-error",
    errorText: "Protected content could not be displayed.",
  },
});
```

`publicBasePath` is the URL prefix where the output root is mounted. Use `/`
for a root deployment or a root-relative subpath such as `/docs`; nested pages
receive the same absolute, subpath-safe asset URLs. Remote asset origins are
not accepted in this field. Route them through the same public origin if a CDN
stores the bytes elsewhere.

```bash
npm exec glyphscramble -- prepare
npm exec glyphscramble -- static --input dist --output dist-protected --concurrency 8
npm exec glyphscramble -- doctor --static-output dist-protected
```

`errorText` localizes the generic visible failure status and is capped at 512
UTF-8 bytes. It must not repeat or summarize the protected source. The same
generic text is recorded in the version 3 manifest so `doctor` can reject a page whose
failure contract was changed after publication.

In Vite 7 or 8, `glyphscrambleStatic(config)` can own this two-tree flow from
the normal `vite build` command. It captures the user's final `outDir`, directs
Vite into `.glyphscramble/vite-input`, then publishes the protected tree to the
original output. `base` supplies `publicBasePath` when it is root-relative.
Astro static builds use the CLI after `astro build`; the repository example
keeps its Astro input and protected publication in separate directories.

The publisher stages and verifies a complete sibling tree before replacing the
destination. Upload that tree as one release. Do not merge it into an existing
output directory: an old and new manifest in one tree is deliberately rejected
as a mixed build. Hosts without an atomic directory swap should publish to a
new versioned prefix, verify it, then switch routing to that prefix.

## Scale and concurrency

Static planning indexes a document in one traversal, materializes DOM paths
only for protected nodes or diagnostics, and skips expensive safety detectors
for unrelated subtrees. It validates NFC and font coverage before staging; a
failure names the source file, DOM path, font, face, code point, and the
coverage or normalization repair. Transformation reuses a clone of that
validated parse, while `doctor` independently reparses the published HTML and
checks its protected-text fingerprint.

File and asset work uses eight concurrent tasks by default. Set
`--concurrency <1-32>` (or `static.concurrency` through the programmatic API)
to match the memory and file-descriptor budget of the build runner. A value of
one is useful on constrained CI. Output and manifest order remain deterministic
at every setting, and a failed pool settles in-flight tasks before the staging
directory is removed.

The automated Node 22/24 regression gate covers a 10,000-sibling document and
a 1,000-level deep document within three seconds each, plus deterministic
serial/eight-way publication of 40 HTML files and 100 assets. These are tested
ceilings for the beta, not a claim of unlimited document or site size. Measure
larger sites on the intended build runner and lower concurrency when retained
parse trees and parallel file buffers create memory pressure.

## Cache policy

The generated font, CSS, JavaScript, and manifest filenames contain SHA-256
digests of their emitted bytes and live below `/_glyphscramble/<build-id>/`.
Apply these response policies:

| Resource                                           | Recommended `Cache-Control`                                              | Reason                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Hashed fonts, CSS, JavaScript, and license notices | `public, max-age=31536000, immutable`                                    | A changed byte creates a new build path; notices ship with that immutable build. |
| Transformed HTML                                   | `public, max-age=0, must-revalidate` or the site's normal short HTML TTL | HTML selects the build and must not outlive its referenced asset tree.           |
| Hashed manifest                                    | `public, no-cache`                                                       | The name is immutable, while revalidation keeps deployment checks operational.   |

Keep the prior build directory available for at least the maximum HTML cache
lifetime during a routing change. Run `doctor --static-output` on the exact
tree being uploaded and, where possible, on a downloaded deployment artifact.

## Content Security Policy

All generated code and styles are external files. There is no inline script,
inline style attribute, `eval`, or runtime nonce requirement in static mode.
The smallest standalone policy is:

```text
default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'
```

The same values are available from `staticGlyphCspDirectives()`. Merge them
with the site's existing image, connection, frame, and other sources rather
than replacing a broader application policy. If a reverse proxy exposes the
asset path from a separate origin, add that exact HTTPS origin to `script-src`,
`style-src`, and `font-src`; a nonce authorizes inline code and does not
authorize these external font or asset requests. CSP hashes are unnecessary
for byte-addressed external files, though a host may add SRI independently.

If CSS is blocked, the block's native `hidden` attribute prevents encoded text
from appearing and the generic status remains visible. If JavaScript is
blocked, the stylesheet reveals the generic status after the configured
timeout. A missing, corrupt, or disallowed font follows the same fail-closed
path.

## Accessibility and SEO

The compiler writes `hidden` and `aria-hidden="true"` into every protected
element before the HTML reaches a browser. The attribute remains in loading,
ready, and failure states. A separate live status contains only the generic
failure message; no plaintext mirror is generated.

This is intentionally not WCAG-conformant: a sighted reader may see content
that assistive technology cannot access. Restrict protection to non-essential,
opted-in high-value blocks and provide an accessible acquisition route outside
the protected representation. Never protect navigation, headings, forms,
prices required to transact, legal or safety text, or account recovery.

Search crawlers see encoded scalars rather than meaningful words. Keep titles,
descriptions, headings, link context, structured data, and enough nearby
summary copy unprotected. Do not restore plaintext through hidden DOM,
`aria-label`, JSON-LD, OpenGraph, feeds, source maps, or client bundles; each is
a scraping side channel.
