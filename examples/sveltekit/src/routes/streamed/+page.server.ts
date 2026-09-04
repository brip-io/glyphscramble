import { getGlyphResponseContext } from "@brip/glyphscramble-sveltekit";
import type { GlyphPayload } from "@brip/glyphscramble";
import type { PageServerLoad } from "./$types";

const STREAMED = "Delayed protected stream content.";

export const load: PageServerLoad = (event) => {
  const glyphs = getGlyphResponseContext(event);
  return {
    payload: new Promise<GlyphPayload>((resolve) => {
      setTimeout(async () => {
        resolve(
          await glyphs.scrambleAsync(STREAMED, {
            font: "body",
            lang: "en",
          }),
        );
      }, 50);
    }),
  };
};
