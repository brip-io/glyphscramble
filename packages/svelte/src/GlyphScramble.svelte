<script lang="ts">
  import type { GlyphPayload } from "@brip/glyphscramble";
  import { glyphPayload } from "@brip/glyphscramble-svelte";

  let { payload, fontTimeoutMs }: { payload: GlyphPayload; fontTimeoutMs?: number } = $props();
</script>

<span use:glyphPayload={{ payload, timeoutMs: fontTimeoutMs }} lang={payload.lang} hidden aria-hidden="true">{payload.encodedText}</span>
