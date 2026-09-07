# @brip/glyphscramble-nuxt

Nuxt 4/Nitro request integration and Vue component registration for
GlyphScramble by BRIP.

```bash
npm install @brip/glyphscramble @brip/glyphscramble-nuxt
npx @brip/glyphscramble init
```

The module installs request context, the font endpoint, selective cache
handling, and the payload-only component. The adapter owns the Vue renderer and
exports common payload/config types; applications do not install
`@brip/glyphscramble-vue` directly. Read the [Nuxt guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#vue-3-and-nuxt-4).

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
