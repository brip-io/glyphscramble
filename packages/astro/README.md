# @brip/glyphscramble-astro

Astro 7 SSR middleware and payload component for GlyphScramble by BRIP.

```bash
npm install @brip/glyphscramble @brip/glyphscramble-astro
npx @brip/glyphscramble init
```

SSR uses per-response mappings. Static Astro output instead uses the core
post-build compiler and one mapping per build. Read the [Astro guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#astro-7).

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
