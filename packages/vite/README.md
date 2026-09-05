# @brip/glyphscramble-vite

Vite 7/8 SSR primitives and explicit static/per-build compiler integration for
GlyphScramble by BRIP.

```bash
npm install @brip/glyphscramble @brip/glyphscramble-vite
npx @brip/glyphscramble init
```

A client-only Vite build cannot provide per-response protection. Static mode
reuses one recoverable mapping until the next build. Read the [Vite guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#vite-and-vanilla-servers).

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
