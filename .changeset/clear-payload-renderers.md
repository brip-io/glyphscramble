---
"@brip/glyphscramble": minor
"@brip/glyphscramble-react": minor
"@brip/glyphscramble-next": minor
"@brip/glyphscramble-vue": minor
"@brip/glyphscramble-nuxt": minor
"@brip/glyphscramble-svelte": minor
"@brip/glyphscramble-sveltekit": minor
"@brip/glyphscramble-astro": minor
---

Expose `GlyphText` as the canonical payload-only renderer across every
framework adapter while retaining `GlyphScramble` as a beta compatibility
alias. Reject plaintext children and slots, arbitrary component polymorphism,
and void elements before they can bypass the owned font lifecycle.
