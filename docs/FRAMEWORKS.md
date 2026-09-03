# Framework integration

All SSR integrations follow the same sequence: create one process-level engine, wait for its one-use variant pool during startup, call `beginResponse()` for each dynamic document, scramble plaintext on the server, render only `GlyphPayload`, route font requests to that same engine's `fontResponse()`, and mark the containing response `private, no-store` only when `ResponseContext.used` is true.

Every client adapter delegates to the same validated `mountGlyphPayload()` lifecycle. The data-only v2 payload contains exact face descriptors and no serialized CSS; duplicate mounts share a face load, reactive updates abort stale work, and unmount releases timers, rules, and registrations. See [Client payload and font lifecycle](CLIENT-RUNTIME.md).

The `response-pool` runtime is intentionally stateful. Do not create a new engine per request or route the font URL to an instance that cannot access the issuing process's variant. Pool exhaustion throws before rendering and must remain a closed failure. A load-balanced deployment needs request affinity or a future external `FontVariantProvider`; it must not regenerate on the font request or silently reuse a mapping across responses.

## React and Next 16

Run `glyphscramble init` in an App Router project, prepare the configured font,
then call the generated process-level helper from an async Server Component:

```tsx
import { GlyphScramble } from "@brip/glyphscramble-next";
import { glyphs } from "@/glyphscramble.next";

export default async function PremiumExcerpt() {
  const payload = await glyphs.scramble("Server-only high-value text.", {
    font: "body",
    lang: "en",
  });
  return <GlyphScramble payload={payload} />;
}
```

The helper calls Next's request-time boundary and React request cache, so all
protected blocks in one RSC render share one context while different responses
rotate. The client wrapper refreshes shortly before payload expiry and fails
closed if the refresh or font load cannot complete. Equivalent cloned payloads
do not remount the font lifecycle. `fontTimeoutMs` and `errorText` customize
the shared client guard without exposing plaintext.

The generated filesystem route is
`app/%5Fglyphscramble/font/[token]/[face]/route.ts` (or under `src/app`).
Its URL is still `/_glyphscramble/...`; a literal `_glyphscramble` folder is
private to Next and will not route. The handler exports GET and HEAD on Next's
default Node runtime. Do not add `runtime` or `dynamic` route constants when
Cache Components is enabled, and do not import either package's `/server`
entrypoint from a file containing `"use client"`.

The adapter shares independently bundled page and Route Handler modules through
one process-global engine. This makes self-hosted, single-process Next work; it
does not make process-local font variants available across serverless
functions, restarts, or horizontally scaled instances. Those deployments remain
unsupported until an external variant provider exists. Next Proxy is neither
generated nor required and cannot decide cache policy after downstream render.

## Vue 3 and Nuxt 4

The Nuxt middleware attaches a response context to the Nitro event and handles the font prefix before rendering. Pass the resulting payload to the Vue component. Do not serialize the original string into Nuxt state.

## Svelte 5 and SvelteKit 2

Install `createGlyphHandle()` as the server handle. It places the response context in `event.locals.glyphscramble`. Render the package component or apply the `glyphPayload` action to an element containing only `encodedText`.

## Astro 7

SSR mode uses `createAstroGlyphMiddleware()`. The `.astro` component emits encoded text plus a serialized data-only payload and mounts it through the bundled shared runtime. Static mode accepts only marked HTML outside `astro-island` or other hydrated ancestors; protected client islands fail during planning.

## Vite and vanilla servers

Vite is not a server boundary. Per-response rotation requires a Node or Fetch server that owns `createGlyphEngine()`. The static command and Vite plugin support non-hydrated HTML blocks only and fail on known React/Vue/Svelte/Astro hydration markers. They do not protect SPA state, component props, client bundles, or hydrated descendants, and always emit a per-build downgrade warning.

Framework initializers generate no more than one config and three integration files. Run `glyphscramble doctor` after client navigation, streaming, or layout changes.
