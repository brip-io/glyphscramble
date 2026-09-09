---
"@brip/glyphscramble": minor
"@brip/glyphscramble-react": minor
"@brip/glyphscramble-vue": minor
"@brip/glyphscramble-svelte": minor
"@brip/glyphscramble-astro": minor
---

Add compiler-backed `GlyphStaticBoundary` entrypoints for non-hydrated React,
Vue, Svelte, and Astro output. Static planning now validates versioned boundary
markers and inline font overrides, records protected element and text-node
counts, forces one mapped face across descendants, and fails closed when the
computed font cascade escapes that face.
