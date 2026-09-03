# Framework integration

All SSR integrations follow the same sequence: create one process-level engine, wait for its one-use variant pool during startup, call `beginResponse()` for each dynamic document, scramble plaintext on the server, render only `GlyphPayload`, route font requests to that same engine's `fontResponse()`, and mark the containing response `private, no-store` only when `ResponseContext.used` is true.

The `response-pool` runtime is intentionally stateful. Do not create a new engine per request or route the font URL to an instance that cannot access the issuing process's variant. Pool exhaustion throws before rendering and must remain a closed failure. A load-balanced deployment needs request affinity or a future external `FontVariantProvider`; it must not regenerate on the font request or silently reuse a mapping across responses.

## React and Next 16

Use `createGlyphPayload` in a Server Component and pass its result to `<GlyphScramble payload={payload} />`. Export `fontRoute` from the generated App Router route. Apply `responseHeaders()` only to an explicitly protected route group; Next Proxy cannot observe downstream context use. Never import the server helper from a file containing `"use client"`.

## Vue 3 and Nuxt 4

The Nuxt middleware attaches a response context to the Nitro event and handles the font prefix before rendering. Pass the resulting payload to the Vue component. Do not serialize the original string into Nuxt state.

## Svelte 5 and SvelteKit 2

Install `createGlyphHandle()` as the server handle. It places the response context in `event.locals.glyphscramble`. Render the package component or apply the `glyphPayload` action to an element containing only `encodedText`.

## Astro 7

SSR mode uses `createAstroGlyphMiddleware()`. The `.astro` component emits encoded text, the matching `@font-face`, and a load guard. Static mode accepts only marked HTML outside `astro-island` or other hydrated ancestors; protected client islands fail during planning.

## Vite and vanilla servers

Vite is not a server boundary. Per-response rotation requires a Node or Fetch server that owns `createGlyphEngine()`. The static command and Vite plugin support non-hydrated HTML blocks only and fail on known React/Vue/Svelte/Astro hydration markers. They do not protect SPA state, component props, client bundles, or hydrated descendants, and always emit a per-build downgrade warning.

Framework initializers generate no more than one config and three integration files. Run `glyphscramble doctor` after client navigation, streaming, or layout changes.
