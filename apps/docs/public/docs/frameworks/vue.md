# Vue 3

Render and reactively update a GlyphPayload with the shared font lifecycle.

Source: https://glyphscramble.brip.io/docs/frameworks/vue/

The Vue package renders an existing `GlyphPayload`. It does not create an engine or scramble browser strings. Pair it with Nuxt or a generic Fetch/Node server.

## Render a server-issued payload

```vue
<script setup lang="ts">
import { GlyphScramble } from "@brip/glyphscramble-vue";
import type { GlyphPayload } from "@brip/glyphscramble";

defineProps<{ payload: GlyphPayload }>();
</script>

<template>
  <GlyphScramble
    :payload="payload"
    as="span"
    :font-timeout-ms="4000"
    error-text="This protected excerpt could not be displayed."
  />
</template>
```

The component keeps the element hidden and `aria-hidden` until the exact generated font loads. Reactive payload changes abort stale work. Equivalent clones are no-ops, and unmount releases the shared face registration.

Do not pass the source string as a prop, fallback, label, or browser state. Use the [Nuxt guide](/docs/frameworks/nuxt/) when Nuxt owns the server boundary.
