import { getGlyphResponseContext } from "@brip/glyphscramble-sveltekit";
import type { PageServerLoad } from "./$types";

const FIRST = "Sensitive analyst note alpha.";
const SECOND = "Sensitive analyst note beta.";

export const load: PageServerLoad = async (event) => {
  const glyphs = getGlyphResponseContext(event);
  const [first, second] = await Promise.all([
    glyphs.scrambleAsync(FIRST, { font: "body", lang: "en" }),
    glyphs.scrambleAsync(SECOND, { font: "body", lang: "en" }),
  ]);
  return {
    first,
    second,
    existingHookVisited: event.locals.existingHookVisited === true,
  };
};
