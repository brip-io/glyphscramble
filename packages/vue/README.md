# @brip/glyphscramble-vue

Payload-only Vue 3 component for GlyphScramble by BRIP.

```bash
npm install --save-exact @brip/glyphscramble@beta @brip/glyphscramble-vue@beta
```

Pass only a server-produced `GlyphPayload` to `GlyphText`; it accepts no slots,
and `as` is limited to supported native text containers. `GlyphScramble`
remains a deprecated beta alias. For non-hydrated static Vue output only,
import `GlyphStaticBoundary` from `@brip/glyphscramble-vue/static`; its default
slot is transformed only by the post-build compiler and must never hydrate.
Read the [Vue and
Nuxt guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#vue-3-and-nuxt-4)
and protect only optional, high-value content.

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
