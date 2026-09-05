# SvelteKit 2

Compose a request handle, typed locals, font endpoint, and Svelte renderer.

Source: https://glyphscramble.brip.io/docs/frameworks/sveltekit/

The initializer creates a process-level helper and locals augmentation. If `hooks.server.ts` already exists, it prints a safe composition instead of overwriting the file.

## Compose the handle

```ts
import { sequence } from "@sveltejs/kit/hooks";
import { glyphHandle } from "$lib/server/glyphscramble";
import { appHandle } from "$lib/server/app-handle";

export const handle = sequence(glyphHandle, appHandle);
```

Put the GlyphScramble handle first so it owns the complete downstream request and can apply selective headers. Declare streaming protected routes when headers may commit before the payload is created.

## Server load

```ts
import { getGlyphResponseContext } from "@brip/glyphscramble-sveltekit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const glyphs = getGlyphResponseContext(event);
  return {
    excerpt: await glyphs.scrambleAsync(
      "Optional server-only research excerpt.",
      { font: "body", lang: "en" },
    ),
  };
};
```

Render `data.excerpt` with `@brip/glyphscramble-svelte`. Source text must stay in `+page.server.ts` or `+server.ts`, never a universal load or client store.

The v0.1 adapter supports one long-lived Node process. Multiple instances and function-per-route deployment need an external variant provider.
