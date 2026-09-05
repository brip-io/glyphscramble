---
title: Nuxt 4
description: Install Nitro request context, font routing, selective cache controls, and the Vue renderer.
order: 250
status: available
group: Frameworks
mode: per-response
packages:
  - "@brip/glyphscramble-nuxt"
  - "@brip/glyphscramble-vue"
symbols:
  - useGlyphScramble
  - GlyphScramble
lastReviewedAgainst: 0.1.0-beta.0
---

The Nuxt module installs a process-level engine, Nitro request context, GET/HEAD font route, selective cache handling, and the Vue component.

## Register the module

```ts
export default defineNuxtConfig({
  modules: [
    [
      "@brip/glyphscramble-nuxt/module",
      { streaming: { protectedRoutes: ["/premium"] } },
    ],
  ],
});
```

Declare a page route before rendering when its payload may be emitted after Nitro commits headers. Exact paths and descendants receive `private, no-store`; unrelated routes retain their cache policy.

## Create payloads in a server route

```ts
import { useGlyphScramble } from "@brip/glyphscramble-nuxt/context";

export default defineEventHandler(async (event) => {
  const glyphs = useGlyphScramble(event);
  return glyphs.scrambleAsync("Optional server-only research excerpt.", {
    font: "body",
    lang: "en",
  });
});
```

Fetch the payload with `useFetch<GlyphPayload>()` and render `<GlyphScramble :payload="payload" />`. Never put the original string in `useState`, `useAsyncData`, runtime config, or page props.

Nuxt v0.1 supports Nitro's single-process `node-server` preset on Node 22/24. Edge, serverless, clustered, and horizontally scaled presets are not supported yet.
