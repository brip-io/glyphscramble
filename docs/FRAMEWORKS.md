# Framework integration

All SSR integrations follow the same sequence: create one process-level engine, wait for its one-use variant pool during startup, call `beginResponse()` for each dynamic document, await `scrambleAsync()` at the server-only plaintext boundary, render only `GlyphPayload`, route font requests to that same engine's `fontResponse()`, and mark the containing response `private, no-store` only when `ResponseContext.used` is true. Creating an unused context consumes no variant; `scramble()` remains available as an explicit no-wait path.

Every client adapter delegates to the same validated `mountGlyphPayload()` lifecycle. The compact data-only v3 payload contains exact face descriptors and no serialized CSS; duplicate mounts and temporary remounts share a bounded face load, equivalent payload clones are no-ops, and semantic updates abort stale work. React, Vue, Svelte, and Astro expose the same `fontTimeoutMs` and localized `errorText` controls. See [Client payload and font lifecycle](CLIENT-RUNTIME.md).

Core `beginResponse()` and the Next, Nuxt, SvelteKit, and Astro server-helper
options accept the same `faces: [{ font, face }]` predeclaration when a route or
application wants a smaller fixed token scope. Omitting it authorizes the
bounded prepared configuration and remains the convenient default.

The `response-pool` runtime is intentionally stateful. Do not create a new engine per request or route the font URL to an instance that cannot access the issuing process's variant. Bounded acquisition timeout or overload throws before rendering and must remain a closed failure. A load-balanced deployment needs request affinity or an external `FontVariantProvider`; it must not regenerate on the font request or silently reuse a mapping across responses. Use `engine.drain()` after removing an instance from application traffic so issued fonts remain available until expiry or the shutdown deadline. See [Runtime capacity and shutdown](RUNTIME-CAPACITY.md).

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

Run `glyphscramble init`, then use the generated middleware and locals type.
The middleware is typed against Astro's real `MiddlewareHandler` API and owns
one engine plus one response context per rendered route:

```ts
import config from "../glyphscramble.config";
import { createAstroGlyphMiddleware } from "@brip/glyphscramble-astro";

export const onRequest = await createAstroGlyphMiddleware(config);
```

Astro can defer component and endpoint work until a response stream is pulled.
The safe default buffers at most 2 MiB, exhausts that lazy stream, then applies
`private, no-store` only if the context was used. The ceiling is fail-closed
and explicit:

```ts
export const onRequest = await createAstroGlyphMiddleware(config, {
  streaming: { strategy: "buffer", maxBytes: 4 * 1024 * 1024 },
});
```

For large streamed responses, opt in by route instead. Only matched routes
receive a context, and their protected headers are committed before rendering:

```ts
export const onRequest = await createAstroGlyphMiddleware(config, {
  streaming: {
    strategy: "route",
    protectedRoute: ({ url }) => url.pathname.startsWith("/premium/"),
  },
});
```

Render the branded payload with
`@brip/glyphscramble-astro/GlyphScramble.astro`. `fontTimeoutMs` and
`errorText` customize the shared R06 guard. A versioned custom element mounts
and destroys exactly one lifecycle per block; there is no document-wide scan.
The package's build runs `astro check`, because ordinary `tsc` ignores `.astro`
files. See Astro's official [middleware API](https://docs.astro.build/en/reference/modules/astro-middleware/)
and [typechecking guidance](https://docs.astro.build/en/guides/typescript/).

Astro static output uses the same post-build marker as any other HTML generator.
It accepts only non-hydrated output; a protected `astro-island`, `client:*`
boundary, or other known hydration marker fails before publication.

## Vite and vanilla servers

Vite is not a server boundary. Per-response rotation requires a Node or Fetch
server that owns `createGlyphEngine()`. The generic reference implementation is
in `examples/node-fetch`: it owns one process-level engine, creates a context
per complete response, routes font GET/HEAD to that same engine, applies cache
headers only after rendering, serves the client runtime from the same origin,
and drains the server and engine on shutdown. A streamed server response must
declare protection and commit `private, no-store` before its first byte.

For non-hydrated static HTML, register the real Vite plugin:

```ts
import { defineConfig } from "vite";
import glyphConfig from "./glyphscramble.config.ts";
import { glyphscrambleStatic } from "@brip/glyphscramble-vite";

export default defineConfig({
  base: "/docs/",
  build: { outDir: "dist" },
  plugins: [glyphscrambleStatic(glyphConfig)],
});
```

The plugin reads Vite's resolved root, base, mode, and output contract, writes
the ordinary build into a fresh internal staging directory, and atomically
replaces the configured final output only after R02/R03 planning and
verification succeed. Staging is removed after success and protected output is
never a future transform input. Every build emits the static per-build
downgrade warning. Non-root-relative Vite bases require an explicit
`publicBasePath`. See Vite's official [plugin API](https://vite.dev/guide/api-plugin.html).

`init` creates a complete config when none exists, patches a conventional
object-form `vite.config` once, and refuses dynamic or ambiguous configurations
with an exact manual snippet before writing any file. The plugin rejects SSR
bundles, known React/Vue/Svelte/Astro hydration markers, and protected islands.
It does not protect SPA state, component props, client bundles, or
client-fetched APIs.

Framework initializers generate no more than one config and three integration
files. Run `glyphscramble doctor` after client navigation, streaming, or layout
changes.
