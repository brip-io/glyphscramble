<script lang="ts">
  import {
    glyphStaticBoundaryAttributes,
    isGlyphStaticBoundaryElement,
  } from "@brip/glyphscramble";
  import type { GlyphStaticBoundaryProps } from "./types.js";

  let {
    font,
    as = "div",
    children,
    ...attributes
  }: GlyphStaticBoundaryProps = $props();

  const boundary = $derived.by(() => {
    if (!isGlyphStaticBoundaryElement(as))
      throw new TypeError(
        "GlyphStaticBoundary `as` must be a supported non-interactive native element.",
      );
    return {
      element: as,
      marker: glyphStaticBoundaryAttributes(font),
    };
  });
</script>

<svelte:element this={boundary.element} {...attributes} {...boundary.marker}>
  {@render children()}
</svelte:element>
