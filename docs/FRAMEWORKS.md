# Framework integration

All SSR integrations follow the same sequence: create one process-level engine, call `beginResponse()` for each dynamic document, scramble plaintext on the server, render only `GlyphPayload`, route font requests to `engine.fontResponse()`, and mark the containing response `private, no-store`.

## React and Next 16

Use `createGlyphPayload` in a Server Component and pass its result to `<GlyphScramble payload={payload} />`. Export `fontRoute` from the generated App Router route. Apply `responseHeaders()` in `proxy.ts`. Never import the server helper from a file containing `"use client"`.

## Vue 3 and Nuxt 4

The Nuxt middleware attaches a response context to the Nitro event and handles the font prefix before rendering. Pass the resulting payload to the Vue component. Do not serialize the original string into Nuxt state.

## Svelte 5 and SvelteKit 2

Install `createGlyphHandle()` as the server handle. It places the response context in `event.locals.glyphscramble`. Render the package component or apply the `glyphPayload` action to an element containing only `encodedText`.

## Astro 7

SSR mode uses `createAstroGlyphMiddleware()`. The `.astro` component emits encoded text, the matching `@font-face`, and a load guard. Static mode uses the post-build marker workflow instead.

## Vite and vanilla servers

Vite is not a server boundary. Per-response rotation requires a Node or Fetch server that owns `createGlyphEngine()`. Fully static React/Vue/Svelte applications can use `glyphscramble static` or the Vite static plugin, which always emits a downgrade warning because rotation is per build.

Framework initializers generate no more than one config and three integration files. Run `glyphscramble doctor` after client navigation, streaming, or layout changes.
