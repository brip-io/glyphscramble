<script lang="ts">
  import { GlyphText } from "@brip/glyphscramble-sveltekit";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<main>
  <h1>Deferred protected block</h1>
  {#await data.payload}
    <p>Loading protected block.</p>
  {:then payload}
    <GlyphText {payload} data-testid="streamed-block" />
  {/await}
</main>
