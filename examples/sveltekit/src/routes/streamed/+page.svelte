<script lang="ts">
  import { GlyphScramble } from "@brip/glyphscramble-svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<main>
  <h1>Deferred protected block</h1>
  {#await data.payload}
    <p>Loading protected block.</p>
  {:then payload}
    <GlyphScramble {payload} data-testid="streamed-block" />
  {/await}
</main>
