---
title: Fetch and Node
description: Integrate the core engine at a generic Fetch-compatible server boundary.
order: 210
status: available
group: Frameworks
mode: per-response
packages:
  - "@brip/glyphscramble"
symbols:
  - createGlyphEngine
  - responseHeadersForContext
lastReviewedAgainst: 0.1.0-beta.0
---

The core package works with servers that accept a Fetch `Request` and return a Fetch `Response`. Use this boundary for custom Node servers and Vite SSR.

## Create one engine

```ts
import {
  createGlyphEngine,
  responseHeadersForContext,
} from "@brip/glyphscramble";
import config from "./glyphscramble.config.js";

const engine = await createGlyphEngine(config);

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith(`${config.routePrefix}/font/`)) {
    return engine.fontResponse(request);
  }

  const glyphs = engine.beginResponse({ signal: request.signal });
  const payload = await glyphs.scrambleAsync(
    "Optional server-only research excerpt.",
    { font: "body", lang: "en" },
  );
  return Response.json(payload, {
    headers: responseHeadersForContext(glyphs),
  });
}
```

The example returns only the protected payload. If you embed it in HTML, serialize `payload.encodedText` and the validated payload fields, never the source string.

## Own the lifecycle

Call `engine.drain()` when the process leaves application traffic, then `engine.close()` at shutdown. A load balancer must route the later font request to the same engine or an external variant provider. Do not create an engine inside `handleRequest`.

Use [`mountGlyphPayload`](/docs/reference/glyph-payload/) or a UI adapter to register the font and reveal the encoded element.
