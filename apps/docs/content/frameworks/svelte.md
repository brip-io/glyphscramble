---
title: Svelte 5
description: Render a server-issued GlyphPayload with a component or action.
order: 260
status: available
group: Frameworks
mode: per-response
packages:
  - "@brip/glyphscramble-svelte"
symbols:
  - GlyphScramble
  - glyphPayload
lastReviewedAgainst: 0.1.0-beta.0
---

The Svelte package contains the payload-only UI layer. Pair it with SvelteKit or a generic server boundary that issues a `GlyphPayload` and serves the matching font.

## Component

```svelte
<script lang="ts">
  import { GlyphScramble } from "@brip/glyphscramble-svelte";
  import type { GlyphPayload } from "@brip/glyphscramble";

  let { payload }: { payload: GlyphPayload } = $props();
</script>

<GlyphScramble
  {payload}
  fontTimeoutMs={4000}
  errorText="This protected excerpt could not be displayed."
/>
```

The `glyphPayload` action exposes the same lifecycle for an existing element. Payload updates hide until the replacement font succeeds, equivalent clones do nothing, and destroy aborts pending work.

Both APIs render only encoded text and keep it `aria-hidden`. Do not serialize the source text into a Svelte prop, fallback, store, or browser bundle.
