---
title: React
description: Render a branded GlyphPayload without letting plaintext enter a Client Component.
order: 220
status: available
group: Frameworks
mode: per-response
packages:
  - "@brip/glyphscramble-react"
symbols:
  - GlyphScramble
  - createGlyphPayloadAsync
lastReviewedAgainst: 0.1.0-beta.0
---

The React package is a payload renderer. Pair it with a server integration that owns the engine and font route. For Next.js use the dedicated [Next adapter](/docs/frameworks/next/).

## Convert plaintext on the server

```tsx
import { GlyphScramble } from "@brip/glyphscramble-react";
import { createGlyphPayloadAsync } from "@brip/glyphscramble-react/server";
import type { ResponseContext } from "@brip/glyphscramble";

export async function ProtectedExcerpt({
  context,
  text,
}: {
  context: ResponseContext;
  text: string;
}) {
  const payload = await createGlyphPayloadAsync(context, text, {
    font: "body",
    lang: "en",
  });
  return (
    <GlyphScramble
      payload={payload}
      errorText="This protected excerpt could not be displayed."
    />
  );
}
```

The `/server` entrypoint imports `server-only`. Passing plaintext through a Client Component, browser store, hydration prop, or fallback defeats the boundary.

## Client behavior

`GlyphScramble` accepts only a branded `GlyphPayload`. It keeps the element hidden and `aria-hidden`, registers the exact generated face, reveals after `document.fonts` succeeds, and cleans up stale loads on updates or unmount. Equivalent payload clones do not restart the lifecycle.

Use `fontTimeoutMs` to shorten the default wait and `errorText` for a localized generic failure. Neither option may contain the protected source.
