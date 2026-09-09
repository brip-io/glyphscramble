# @brip/glyphscramble-astro

Astro 7 SSR middleware and payload component for GlyphScramble by BRIP.

```bash
npm install --save-exact @brip/glyphscramble@beta @brip/glyphscramble-astro@beta
npm exec glyphscramble -- init
```

SSR uses per-response mappings. Static Astro output instead uses the core
post-build compiler and one mapping per build. The adapter exports common
payload/config types and its payload-only renderer at
`@brip/glyphscramble-astro/GlyphText.astro`; default slots fail closed during
the build or request. The old `GlyphScramble.astro` subpath remains a beta
compatibility alias. Read the [Astro guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#astro-7).
Static Astro pages can import
`@brip/glyphscramble-astro/GlyphStaticBoundary.astro` to wrap an existing
non-hydrated component subtree. The component only emits a marker; publish the
separate post-build compiler output, which rotates once per build.

Astro SSR pages using the middleware's default bounded-buffer strategy can
import `@brip/glyphscramble-astro/GlyphResponseBoundary.astro`. It wraps an
existing inert component subtree and rotates that final HTML once per response.
It rejects client islands, interactive content, mixed fonts, route-streaming
mode, and static builds instead of falling back to plaintext. See the
[per-response boundary guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#per-response-inert-html-boundary).

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
