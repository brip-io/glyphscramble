<script lang="ts">
  import type { GlyphPayload } from "@brip/glyphscramble";
  import { glyphPayload } from "@brip/glyphscramble-svelte";

  let { payload, fontTimeoutMs, errorText }: { payload: GlyphPayload; fontTimeoutMs?: number; errorText?: string } = $props();
</script>

<span use:glyphPayload={{ payload, timeoutMs: fontTimeoutMs, errorText }} lang={payload.lang} hidden aria-hidden="true">{payload.encodedText}</span>
