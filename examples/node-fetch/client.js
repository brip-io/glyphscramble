import { mountGlyphPayload } from "/glyph-runtime.js";

const element = globalThis.document.querySelector("[data-glyphscramble-node]");
if (element) {
  const payload = JSON.parse(element.dataset.payload);
  mountGlyphPayload(element, payload, {
    errorText: "Protected Node content unavailable.",
  });
}
