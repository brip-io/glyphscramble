<script lang="ts">
  import { GlyphScramble } from "@brip/glyphscramble-svelte";
  import type { GlyphPayload } from "@brip/glyphscramble";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  // svelte-ignore state_referenced_locally
  let first = $state(data.first);
  $effect(() => {
    first = data.first;
  });

  async function replacement(): Promise<{
    first: GlyphPayload;
    second: GlyphPayload;
  }> {
    const response = await fetch("/api/protected");
    if (!response.ok) throw new Error("Protected fixture unavailable.");
    return response.json();
  }

  async function replacePayload(): Promise<void> {
    first = (await replacement()).first;
  }

  function clonePayload(): void {
    first = { ...first };
  }
</script>

<main>
  <nav>
    <a href="/">Home</a>
    <a href="/unprotected">Unprotected example</a>
  </nav>
  <h1>Protected high-value block fixture</h1>
  <section aria-label="Intentionally inaccessible protected content">
    <GlyphScramble
      payload={first}
      errorText="Protected fixture unavailable."
      data-testid="protected-first"
      data-font-url={first.fontUrl}
    />
    <GlyphScramble
      payload={data.second}
      data-testid="protected-second"
      data-font-url={data.second.fontUrl}
    />
    <button data-testid="replace-payload" onclick={replacePayload}>
      Replace payload
    </button>
    <button data-testid="clone-payload" onclick={clonePayload}>
      Clone payload
    </button>
    <output data-testid="existing-hook">{data.existingHookVisited}</output>
  </section>
</main>
