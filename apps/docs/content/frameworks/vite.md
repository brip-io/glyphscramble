---
title: Vite 7 and 8
description: Add atomic static post-processing or use a generic server boundary for Vite SSR.
order: 290
status: available
group: Frameworks
mode: both
packages:
  - "@brip/glyphscramble-vite"
symbols:
  - glyphscrambleStatic
  - createGlyphFetchHandler
lastReviewedAgainst: 0.1.0-beta.0
---

The Vite plugin integrates static output. Vite SSR still needs the generic Fetch/Node engine boundary.

## Static build plugin

```ts
import { defineConfig } from "vite";
import { glyphscrambleStatic } from "@brip/glyphscramble-vite";
import glyphConfig from "./glyphscramble.config";

export default defineConfig({
  plugins: [
    glyphscrambleStatic(glyphConfig, {
      outputDir: "dist",
      publicBasePath: "/",
    }),
  ],
});
```

Vite writes ordinary output into a private staging directory. GlyphScramble validates and atomically publishes the protected output to `dist`, then removes staging. Relative or CDN base URLs require an explicit root-relative `publicBasePath`.

The plugin rejects SSR bundles and known hydrated protected trees. Use it for non-hydrated output or content outside client-owned roots.

## SSR boundary

```ts
import { createGlyphFetchHandler } from "@brip/glyphscramble-vite";
import glyphConfig from "./glyphscramble.config";

export const glyphs = await createGlyphFetchHandler(glyphConfig);
```

Use `glyphs.engine.beginResponse()` when rendering and route `glyphs.font(request)` at the configured prefix. Apply `private, no-store` only after that response context emits a payload.
