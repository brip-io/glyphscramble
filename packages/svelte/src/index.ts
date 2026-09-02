import { revealGlyphPayload } from "@brip/glyphscramble/runtime";
import type { GlyphPayload } from "@brip/glyphscramble";

export function glyphPayload(node: HTMLElement, payload: GlyphPayload) {
  void revealGlyphPayload(node, payload);
  return {
    update(next: GlyphPayload) {
      node.textContent = next.encodedText;
      void revealGlyphPayload(node, next);
    },
  };
}
