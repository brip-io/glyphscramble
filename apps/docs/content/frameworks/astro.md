---
title: Astro 7
description: Protect Astro SSR output through middleware and a payload-only component.
order: 280
status: available
group: Frameworks
mode: both
packages:
  - "@brip/glyphscramble-astro"
symbols:
  - createAstroGlyphMiddleware
lastReviewedAgainst: 0.1.0-beta.0
---

Astro SSR uses middleware to install a response context and serve fonts. Static Astro output can use the conservative static compiler only when protected blocks are outside hydrated islands.

## SSR middleware

```ts
import config from "../glyphscramble.config";
import { createAstroGlyphMiddleware } from "@brip/glyphscramble-astro";

export const onRequest = await createAstroGlyphMiddleware(config, {
  streaming: { strategy: "buffer", maxBytes: 1024 * 1024 },
});
```

The bounded buffer lets middleware discover whether a lazy response used protection before finalizing cache headers. For large streaming responses, use route strategy and explicitly identify protected routes.

## Astro component

```astro
---
import GlyphScramble from "@brip/glyphscramble-astro/GlyphScramble.astro";

const glyphs = Astro.locals.glyphscramble;
if (!glyphs) throw new Error("GlyphScramble middleware is not installed.");
const payload = await glyphs.scrambleAsync(
  "Optional server-only research excerpt.",
  { font: "body", lang: "en" },
);
---

<GlyphScramble
  payload={payload}
  errorText="This protected excerpt could not be displayed."
/>
```

The v0.1 SSR boundary supports a single long-lived Node process. For static mode, mark only non-interactive server-rendered HTML and publish the entire generated artifact atomically.
