<script lang="ts">
  import type { GlyphPayload } from "@brip/glyphscramble";
  import { glyphPayload } from "@brip/glyphscramble-svelte";

  let { payload }: { payload: GlyphPayload } = $props();
</script>

<span use:glyphPayload={payload} hidden aria-hidden="true">{payload.encodedText}</span>
