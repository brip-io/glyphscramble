---
"@brip/glyphscramble": minor
"@brip/glyphscramble-astro": minor
---

Add a bounded, fail-closed per-response HTML boundary for inert Astro SSR and
generic Fetch/Node output. Existing component subtrees can now share one fresh
response font lifecycle without leaking their source text or weakening
unprotected-route caching and streaming behavior.
