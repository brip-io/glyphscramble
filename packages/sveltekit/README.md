# @brip/glyphscramble-sveltekit

SvelteKit 2 request handle and endpoint integration for GlyphScramble by BRIP.

```bash
npm install @brip/glyphscramble @brip/glyphscramble-sveltekit
npx @brip/glyphscramble init
```

The generated handle owns request-local context, font routing, and selective
cache controls. The adapter re-exports the Svelte renderer and common
payload/config types; applications do not install
`@brip/glyphscramble-svelte` directly. Read the [SvelteKit guide](https://github.com/brip-io/glyphscramble/blob/main/docs/FRAMEWORKS.md#svelte-5-and-sveltekit-2).

GlyphScramble raises the cost of bulk DOM scraping; it is not DRM. Apache-2.0.
